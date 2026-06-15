"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Maximize2, Minimize2, Pause, Play, Settings2, Volume2, VolumeX } from "lucide-react"

type YoutubeLikePlayerProps = {
    src: string
    title?: string
    className?: string
    preload?: "none" | "metadata" | "auto"
    onLoadedMetadata?: (video: HTMLVideoElement) => void
    onTimeUpdate?: (video: HTMLVideoElement) => void
    onEnded?: (video: HTMLVideoElement) => void
    onCanPlay?: () => void
    onError?: () => void
}

function formatSeconds(value: number) {
    if (!Number.isFinite(value) || value < 0) return "00:00"
    const total = Math.floor(value)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function YoutubeLikePlayer({
    src,
    title,
    className,
    preload = "metadata",
    onLoadedMetadata,
    onTimeUpdate,
    onEnded,
    onCanPlay,
    onError,
}: YoutubeLikePlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [volume, setVolume] = useState(1)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isFullscreen, setIsFullscreen] = useState(false)

    useEffect(() => {
        const onFsChange = () => {
            setIsFullscreen(document.fullscreenElement === containerRef.current)
        }
        document.addEventListener("fullscreenchange", onFsChange)
        return () => document.removeEventListener("fullscreenchange", onFsChange)
    }, [])

    useEffect(() => {
        setCurrentTime(0)
        setDuration(0)
        setIsPlaying(false)
    }, [src])

    const progress = useMemo(() => {
        if (!duration || !Number.isFinite(duration)) return 0
        return Math.min(100, (currentTime / duration) * 100)
    }, [currentTime, duration])

    const togglePlay = async () => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) {
            try {
                await video.play()
                setIsPlaying(true)
            } catch {
                setIsPlaying(false)
            }
            return
        }
        video.pause()
        setIsPlaying(false)
    }

    const seekTo = (value: number) => {
        const video = videoRef.current
        if (!video || !Number.isFinite(value)) return
        video.currentTime = value
        setCurrentTime(value)
    }

    const changeVolume = (value: number) => {
        const video = videoRef.current
        if (!video) return
        const next = Math.min(1, Math.max(0, value))
        video.volume = next
        video.muted = next === 0
        setVolume(next)
        setIsMuted(next === 0)
    }

    const toggleMute = () => {
        const video = videoRef.current
        if (!video) return
        const nextMuted = !video.muted
        video.muted = nextMuted
        setIsMuted(nextMuted)
    }

    const toggleFullscreen = async () => {
        const container = containerRef.current
        if (!container) return
        if (document.fullscreenElement === container) {
            await document.exitFullscreen()
            return
        }
        if (document.fullscreenElement) await document.exitFullscreen()
        await container.requestFullscreen()
    }

    return (
        <div
            ref={containerRef}
            className={`group relative overflow-hidden rounded-xl bg-black ${className ?? ""}`}
        >
            <video
                ref={videoRef}
                src={src}
                preload={preload}
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                className="h-full w-full"
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => void togglePlay()}
                onLoadedMetadata={(e) => {
                    setDuration(e.currentTarget.duration || 0)
                    setCurrentTime(e.currentTarget.currentTime || 0)
                    setVolume(e.currentTarget.volume || 1)
                    setIsMuted(e.currentTarget.muted)
                    onLoadedMetadata?.(e.currentTarget)
                }}
                onTimeUpdate={(e) => {
                    setCurrentTime(e.currentTarget.currentTime || 0)
                    onTimeUpdate?.(e.currentTarget)
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onCanPlay={() => onCanPlay?.()}
                onEnded={(e) => {
                    setIsPlaying(false)
                    onEnded?.(e.currentTarget)
                }}
                onError={() => onError?.()}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-3 py-2 text-xs text-white/90">
                {title || "Bai hoc video"}
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3">
                <div className="mb-2 flex items-center gap-2">
                    <input
                        type="range"
                        min={0}
                        max={Math.max(duration, 0)}
                        step={0.1}
                        value={Math.min(currentTime, Math.max(duration, 0))}
                        onChange={(e) => seekTo(Number(e.target.value))}
                        className="h-1 w-full cursor-pointer appearance-none rounded bg-white/30 accent-red-500"
                        aria-label="Tien do video"
                    />
                    <span className="w-10 text-right text-[10px] text-white/90">{Math.round(progress)}%</span>
                </div>

                <div className="flex items-center justify-between gap-2 text-white">
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => void togglePlay()} className="rounded-full p-1.5 hover:bg-white/15">
                            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                        <button type="button" onClick={toggleMute} className="rounded-full p-1.5 hover:bg-white/15">
                            {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={isMuted ? 0 : volume}
                            onChange={(e) => changeVolume(Number(e.target.value))}
                            className="h-1 w-20 cursor-pointer appearance-none rounded bg-white/30 accent-white"
                            aria-label="Am luong"
                        />
                        <span className="text-xs font-medium tabular-nums">
                            {formatSeconds(currentTime)} / {formatSeconds(duration)}
                        </span>
                    </div>

                    <div className="flex items-center gap-1">
                        <button type="button" className="rounded-full p-1.5 hover:bg-white/15" title="Cai dat">
                            <Settings2 className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => void toggleFullscreen()} className="rounded-full p-1.5 hover:bg-white/15">
                            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
