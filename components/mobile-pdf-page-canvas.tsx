"use client"

import { useEffect, useRef, useState } from "react"

const mobilePdfBytesCache = new Map<string, Promise<ArrayBuffer>>()
const mobilePdfDocumentCache = new Map<string, Promise<PdfDocumentProxy>>()
const mobilePdfPageCache = new Map<string, Promise<PdfPageProxy>>()

type PdfDocumentProxy = {
    getPage: (pageNumber: number) => Promise<PdfPageProxy>
}

type PdfPageProxy = {
    getViewport: (options: { scale: number }) => PdfViewport
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => {
        cancel: () => void
        promise: Promise<void>
    }
}

type PdfViewport = {
    width: number
    height: number
}

export type MobilePdfPageCanvasErrorCode =
    | "offline"
    | "timeout"
    | "unauthorized"
    | "forbidden"
    | "not-found"
    | "not-pdf"
    | "network"
    | "render"

export type MobilePdfPageCanvasError = {
    code: MobilePdfPageCanvasErrorCode
    message: string
    status?: number
}

const PDF_FETCH_TIMEOUT_MS = 45000
const PDF_WORKER_SRC = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString()

function createPdfError(code: MobilePdfPageCanvasErrorCode, message: string, status?: number): MobilePdfPageCanvasError {
    return { code, message, status }
}

function ensurePdfJsRuntimeCompatibility() {
    type PromiseWithResolvers = typeof Promise & {
        withResolvers?: <T>() => {
            promise: Promise<T>
            resolve: (value: T | PromiseLike<T>) => void
            reject: (reason?: unknown) => void
        }
    }

    const runtimePromise = Promise as PromiseWithResolvers
    if (!runtimePromise.withResolvers) {
        runtimePromise.withResolvers = function withResolvers<T>() {
            let resolve!: (value: T | PromiseLike<T>) => void
            let reject!: (reason?: unknown) => void
            const promise = new Promise<T>((resolvePromise, rejectPromise) => {
                resolve = resolvePromise
                reject = rejectPromise
            })
            return { promise, resolve, reject }
        }
    }
}

function readPdfSignature(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer.slice(0, 5))
    return String.fromCharCode(...bytes)
}

function normalizePdfError(error: unknown): MobilePdfPageCanvasError {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
        return error as MobilePdfPageCanvasError
    }
    if (error instanceof DOMException && error.name === "AbortError") {
        return createPdfError("timeout", "Đường truyền phản hồi quá lâu.")
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        return createPdfError("offline", "Thiết bị đang mất kết nối internet.")
    }
    if (error instanceof Error && /withResolvers|structuredClone|worker|module/i.test(error.message)) {
        return createPdfError("render", `Trình duyệt điện thoại không tương thích với trình render PDF: ${error.message}`)
    }
    if (error instanceof Error && /invalid pdf|pdf|document/i.test(error.message)) {
        return createPdfError("not-pdf", "File tải về không phải PDF hợp lệ.")
    }
    return createPdfError("network", "Không kết nối được tới file preview.")
}

function loadPdfBytes(src: string) {
    const cached = mobilePdfBytesCache.get(src)
    if (cached) return cached

    const request = (async () => {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS)
        try {
            const response = await fetch(src, {
                credentials: "include",
                cache: "no-store",
                signal: controller.signal,
            })
            if (response.status === 401) throw createPdfError("unauthorized", "Phiên đăng nhập đã hết hạn.", response.status)
            if (response.status === 403) throw createPdfError("forbidden", "Bạn chưa có quyền xem file này hoặc file đang bị khóa.", response.status)
            if (response.status === 404) throw createPdfError("not-found", "File preview không còn tồn tại.", response.status)
            if (!response.ok) throw createPdfError("network", `Máy chủ trả về lỗi ${response.status}.`, response.status)

            const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
            const buffer = await response.arrayBuffer()
            const signature = readPdfSignature(buffer)
            if (!contentType.includes("pdf") && signature !== "%PDF-") {
                throw createPdfError("not-pdf", "Đường dẫn hiện tại không trả về file PDF hợp lệ.", response.status)
            }
            return buffer
        } catch (error) {
            mobilePdfBytesCache.delete(src)
            mobilePdfDocumentCache.delete(src)
            throw normalizePdfError(error)
        } finally {
            window.clearTimeout(timeout)
        }
    })()
    mobilePdfBytesCache.set(src, request)
    return request
}

function loadPdfDocument(src: string) {
    const cached = mobilePdfDocumentCache.get(src)
    if (cached) return cached

    const request = (async () => {
        ensurePdfJsRuntimeCompatibility()
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
        pdfjs.GlobalWorkerOptions.workerSrc ||= PDF_WORKER_SRC
        const pdfBytes = await loadPdfBytes(src)
        const loadingTask = pdfjs.getDocument({
            data: new Uint8Array(pdfBytes.slice(0)),
            disableWorker: false,
            disableStream: true,
            disableAutoFetch: true,
            isEvalSupported: false,
            useSystemFonts: true,
            disableFontFace: false,
        } as Parameters<typeof pdfjs.getDocument>[0])
        try {
            return await (loadingTask.promise as unknown as Promise<PdfDocumentProxy>)
        } catch (error) {
            mobilePdfDocumentCache.delete(src)
            throw error
        }
    })()
    mobilePdfDocumentCache.set(src, request)
    return request
}

async function loadPdfPage(src: string, pageNumber: number) {
    const cacheKey = `${src}#${pageNumber}`
    const cached = mobilePdfPageCache.get(cacheKey)
    if (cached) return cached

    const request = loadPdfDocument(src)
        .then((document) => document.getPage(pageNumber))
        .catch((error) => {
            mobilePdfPageCache.delete(cacheKey)
            throw error
        })
    mobilePdfPageCache.set(cacheKey, request)
    return request
}

export function MobilePdfPageCanvas({
    src,
    pageNumber,
    title,
    className,
    onRendered,
    onError,
}: {
    src: string
    pageNumber: number
    title: string
    className?: string
    onRendered?: () => void
    onError?: (error: MobilePdfPageCanvasError) => void
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const onRenderedRef = useRef(onRendered)
    const onErrorRef = useRef(onError)
    const [observedSize, setObservedSize] = useState({ width: 0, height: 0 })
    const [renderSize, setRenderSize] = useState({ width: 0, height: 0 })
    const [isRendering, setIsRendering] = useState(true)
    const [hasRenderedPage, setHasRenderedPage] = useState(false)

    useEffect(() => {
        onRenderedRef.current = onRendered
    }, [onRendered])

    useEffect(() => {
        onErrorRef.current = onError
    }, [onError])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const updateSize = () => {
            const rect = container.getBoundingClientRect()
            const nextSize = {
                width: Math.max(0, Math.round(rect.width)),
                height: Math.max(0, Math.round(rect.height)),
            }
            setObservedSize((currentSize) => {
                if (currentSize.width === nextSize.width && currentSize.height === nextSize.height) return currentSize
                return nextSize
            })
        }

        updateSize()
        const observer = new ResizeObserver(updateSize)
        observer.observe(container)
        window.visualViewport?.addEventListener("resize", updateSize)
        window.addEventListener("orientationchange", updateSize)
        return () => {
            observer.disconnect()
            window.visualViewport?.removeEventListener("resize", updateSize)
            window.removeEventListener("orientationchange", updateSize)
        }
    }, [])

    useEffect(() => {
        if (observedSize.width <= 0 || observedSize.height <= 0) return

        const timer = window.setTimeout(() => {
            setRenderSize(observedSize)
        }, hasRenderedPage ? 120 : 0)

        return () => window.clearTimeout(timer)
    }, [hasRenderedPage, observedSize])

    useEffect(() => {
        setHasRenderedPage(false)
        setIsRendering(true)
    }, [pageNumber, src])

    useEffect(() => {
        if (!src || !pageNumber || renderSize.width <= 0 || renderSize.height <= 0) return

        let cancelled = false
        let renderTask: { cancel: () => void; promise: Promise<void> } | null = null
        let didReportError = false

        const renderPage = async () => {
            setIsRendering(true)
            try {
                const page = await loadPdfPage(src, pageNumber)
                if (cancelled) return

                const baseViewport = page.getViewport({ scale: 1 })
                const scale = Math.max(
                    0.1,
                    Math.min(renderSize.width / baseViewport.width, renderSize.height / baseViewport.height)
                )
                const viewport = page.getViewport({ scale })
                const canvas = canvasRef.current
                if (!canvas) return

                const nextCanvas = window.document.createElement("canvas")
                const context = nextCanvas.getContext("2d", { alpha: false })
                if (!context) return

                const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
                nextCanvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio))
                nextCanvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio))
                context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
                context.fillStyle = "#fff"
                context.fillRect(0, 0, viewport.width, viewport.height)

                renderTask = page.render({ canvasContext: context, viewport })
                await renderTask.promise
                if (cancelled) return

                const visibleContext = canvas.getContext("2d", { alpha: false })
                if (!visibleContext) return
                canvas.width = nextCanvas.width
                canvas.height = nextCanvas.height
                canvas.style.width = `${Math.floor(viewport.width)}px`
                canvas.style.height = `${Math.floor(viewport.height)}px`
                visibleContext.setTransform(1, 0, 0, 1, 0, 0)
                visibleContext.drawImage(nextCanvas, 0, 0)
                if (!cancelled) {
                    setHasRenderedPage(true)
                    setIsRendering(false)
                    onRenderedRef.current?.()
                }
            } catch (error) {
                if (!cancelled && !didReportError) {
                    didReportError = true
                    setIsRendering(false)
                    onErrorRef.current?.(normalizePdfError(error))
                }
            }
        }

        void renderPage()
        return () => {
            cancelled = true
            renderTask?.cancel()
        }
    }, [pageNumber, renderSize.height, renderSize.width, src])

    return (
        <div ref={containerRef} className={`relative grid place-items-center overflow-hidden bg-neutral-100 dark:bg-neutral-950 ${className ?? ""}`}>
            <canvas ref={canvasRef} aria-label={title} className="max-h-full max-w-full select-none shadow-sm touch-none" />
            {isRendering && !hasRenderedPage && (
                <div className="absolute inset-0 grid place-items-center bg-white/90 dark:bg-gray-900/80">
                    <div className="text-center">
                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Đang tải trang...</p>
                    </div>
                </div>
            )}
            {isRendering && hasRenderedPage && (
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm">
                    Đang căn lại...
                </div>
            )}
        </div>
    )
}
