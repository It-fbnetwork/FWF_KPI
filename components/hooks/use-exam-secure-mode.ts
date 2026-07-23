"use client"

import { useEffect, useRef, useState } from "react"
import { Capacitor, registerPlugin } from "@capacitor/core"
import {
  setExamSecureHideLayerVisible,
  setExamSecureWatermarkVisible,
} from "@/components/exam-secure-shield"
import { toast } from "@/components/ui/use-toast"

type ExamSecurePlugin = {
  enable(): Promise<void>
  disable(): Promise<void>
}

let examSecurePlugin: ExamSecurePlugin | null = null

function getExamSecurePlugin() {
  if (typeof window === "undefined") return null
  if (!examSecurePlugin) {
    examSecurePlugin = registerPlugin<ExamSecurePlugin>("ExamSecure")
  }
  return examSecurePlugin
}

function isMacScreenshotShortcut(event: KeyboardEvent) {
  const key = event.key
  const code = event.code
  if (event.metaKey && event.shiftKey && ["3", "4", "5", "#", "$", "%"].includes(key)) {
    return true
  }
  if (
    event.metaKey &&
    event.shiftKey &&
    (code === "Digit3" || code === "Digit4" || code === "Digit5")
  ) {
    return true
  }
  return false
}

function isWindowsScreenshotShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const code = event.code
  if (
    event.metaKey &&
    event.shiftKey &&
    (key === "s" || code === "KeyS")
  ) {
    return true
  }
  if (event.key === "PrintScreen" || event.key === "Print" || code === "PrintScreen") {
    return true
  }
  return false
}

function isScreenshotShortcut(event: KeyboardEvent) {
  if (isMacScreenshotShortcut(event)) return true
  if (isWindowsScreenshotShortcut(event)) return true
  const key = event.key.toLowerCase()
  if (event.shiftKey && (event.metaKey || event.ctrlKey) && key === "s") return true
  return false
}

function isPrintOrSaveShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const code = event.code
  const commandKey = event.ctrlKey || event.metaKey
  return commandKey && (key === "p" || key === "s" || code === "KeyP" || code === "KeyS")
}

async function setNativeSecureMode(enabled: boolean) {
  if (!Capacitor.isNativePlatform()) return
  const plugin = getExamSecurePlugin()
  if (!plugin) return
  try {
    if (enabled) {
      await plugin.enable()
    } else {
      await plugin.disable()
    }
  } catch {
    // Plugin may be unavailable on web/iOS builds without native bridge.
  }
}

type UseExamSecureModeOptions = {
  enabled: boolean
  watermark?: string
  onViolation?: (reason: string) => void
}

export function useExamSecureMode({ enabled, watermark, onViolation }: UseExamSecureModeOptions) {
  const [isContentHidden, setIsContentHidden] = useState(false)
  const [isWatermarkVisible, setIsWatermarkVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const watermarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureProtectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onViolationRef = useRef<UseExamSecureModeOptions["onViolation"]>(onViolation)
  const lastViolationAtRef = useRef(0)

  useEffect(() => {
    onViolationRef.current = onViolation
  }, [onViolation])

  useEffect(() => {
    if (!enabled) {
      setIsContentHidden(false)
      setIsWatermarkVisible(false)
      setExamSecureHideLayerVisible(false)
      setExamSecureWatermarkVisible(false)
      void setNativeSecureMode(false)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (watermarkTimerRef.current) clearTimeout(watermarkTimerRef.current)
      if (captureProtectionTimerRef.current) clearTimeout(captureProtectionTimerRef.current)
      hideTimerRef.current = null
      watermarkTimerRef.current = null
      captureProtectionTimerRef.current = null
      document.body.classList.remove("exam-screenshot-capture")
      return
    }

    void setNativeSecureMode(true)

    const revealIfSafe = () => {
      if (!document.hidden && document.hasFocus()) {
        setIsContentHidden(false)
        setExamSecureHideLayerVisible(false)
        setIsWatermarkVisible(false)
        setExamSecureWatermarkVisible(false)
      }
    }

    const showWatermarkOnly = () => {
      // Imperative first so screenshot can catch watermark before React paint.
      setExamSecureWatermarkVisible(true)
      setIsWatermarkVisible(true)
      if (watermarkTimerRef.current) clearTimeout(watermarkTimerRef.current)
      watermarkTimerRef.current = setTimeout(() => {
        if (!document.hidden && document.hasFocus()) {
          setIsWatermarkVisible(false)
          setExamSecureWatermarkVisible(false)
        }
      }, 4000)
    }

    const reportViolation = (reason: string) => {
      const now = Date.now()
      if (now - lastViolationAtRef.current < 1200) return
      lastViolationAtRef.current = now
      onViolationRef.current?.(reason)
    }

    const protectCapture = (holdMs = 4000) => {
      document.body.classList.add("exam-screenshot-capture")
      if (captureProtectionTimerRef.current) clearTimeout(captureProtectionTimerRef.current)
      captureProtectionTimerRef.current = setTimeout(() => {
        document.body.classList.remove("exam-screenshot-capture")
      }, holdMs)
    }

    const hideContent = (reason: string, options?: { toast?: boolean; holdMs?: number; violation?: boolean }) => {
      setExamSecureHideLayerVisible(true)
      setIsContentHidden(true)
      if (options?.violation !== false) {
        reportViolation(reason)
      }
      if (options?.toast !== false && !onViolationRef.current) {
        toast({
          title: "Chế độ bảo vệ bài thi",
          description: `${reason} Nội dung đã được ẩn tạm thời.`,
          variant: "destructive",
        })
      }
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(revealIfSafe, options?.holdMs ?? 2800)
    }

    const blockEvent = (event: Event) => {
      event.preventDefault()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPrintOrSaveShortcut(event)) {
        event.preventDefault()
        event.stopPropagation()
        protectCapture(5000)
        hideContent("Không được in hoặc lưu trang bài thi.", { holdMs: 3500 })
        return
      }
      if (!isScreenshotShortcut(event)) return
      // 1) Hiện watermark ngay (ưu tiên nằm trong ảnh chụp)
      protectCapture(5000)
      showWatermarkOnly()
      event.preventDefault()
      event.stopPropagation()
      // 2) Một nhịp sau mới ẩn đề — tăng khả năng watermark dính vào screenshot
      window.setTimeout(() => {
        hideContent("Phát hiện thao tác chụp màn hình.", { holdMs: 3500 })
      }, 120)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isScreenshotShortcut(event)) return
      event.preventDefault()
      event.stopPropagation()
      protectCapture(5000)
      showWatermarkOnly()
      hideContent("Phát hiện thao tác chụp màn hình.", { holdMs: 3500 })
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Chuyển tab: ẩn đề, không cần watermark trên UI người dùng.
        hideContent("Bạn vừa chuyển tab hoặc rời màn hình làm bài.")
      } else {
        revealIfSafe()
      }
    }

    const handleWindowBlur = () => {
      setExamSecureHideLayerVisible(true)
      setIsContentHidden(true)
      reportViolation("Bạn vừa rời cửa sổ làm bài.")
    }

    const handleWindowFocus = () => {
      revealIfSafe()
    }

    const handleFullscreenChange = () => {
      const fullscreenDocument = document as Document & {
        webkitFullscreenElement?: Element | null
      }
      const fullscreenElement =
        document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null
      if (!fullscreenElement && !document.hidden && document.hasFocus()) {
        hideContent("Bạn vừa thoát chế độ toàn màn hình.", { holdMs: 3500 })
      }
    }

    const handleBeforePrint = (event: Event) => {
      event.preventDefault()
      protectCapture(5000)
      hideContent("Không được in bài thi.", { holdMs: 5000 })
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("blur", handleWindowBlur)
    window.addEventListener("focus", handleWindowFocus)
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("keyup", handleKeyUp, true)
    window.addEventListener("beforeprint", handleBeforePrint)
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
    document.addEventListener("copy", blockEvent, true)
    document.addEventListener("cut", blockEvent, true)
    document.addEventListener("paste", blockEvent, true)
    document.addEventListener("contextmenu", blockEvent, true)
    document.addEventListener("dragstart", blockEvent, true)
    document.body.classList.add("exam-secure-mode")

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("blur", handleWindowBlur)
      window.removeEventListener("focus", handleWindowFocus)
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("keyup", handleKeyUp, true)
      window.removeEventListener("beforeprint", handleBeforePrint)
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange)
      document.removeEventListener("copy", blockEvent, true)
      document.removeEventListener("cut", blockEvent, true)
      document.removeEventListener("paste", blockEvent, true)
      document.removeEventListener("contextmenu", blockEvent, true)
      document.removeEventListener("dragstart", blockEvent, true)
      document.body.classList.remove("exam-secure-mode")
      document.body.classList.remove("exam-screenshot-capture")
      void setNativeSecureMode(false)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (watermarkTimerRef.current) clearTimeout(watermarkTimerRef.current)
      if (captureProtectionTimerRef.current) clearTimeout(captureProtectionTimerRef.current)
      hideTimerRef.current = null
      watermarkTimerRef.current = null
      captureProtectionTimerRef.current = null
      setExamSecureHideLayerVisible(false)
      setExamSecureWatermarkVisible(false)
      setIsContentHidden(false)
      setIsWatermarkVisible(false)
    }
  }, [enabled])

  return {
    isContentHidden,
    isWatermarkVisible,
    watermark: watermark?.trim() || "FWF Exam",
  }
}
