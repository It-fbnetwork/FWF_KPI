"use client"

type ExamSecureShieldProps = {
  active: boolean
  hidden: boolean
  watermark: string
  /** Watermark only becomes visible when a screenshot attempt is detected. */
  watermarkVisible: boolean
}

export function ExamSecureShield({
  active,
  hidden,
  watermark,
  watermarkVisible,
}: ExamSecureShieldProps) {
  if (!active) return null

  return (
    <>
      {/* Hidden during normal exam UI; flipped on instantly when screenshot is detected. */}
      <div
        id="exam-secure-watermark-layer"
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[88] select-none overflow-hidden"
        style={{
          opacity: watermarkVisible ? 0.22 : 0,
          visibility: watermarkVisible ? "visible" : "hidden",
        }}
      >
        <div className="absolute inset-0 flex flex-wrap content-start gap-x-16 gap-y-20 -rotate-12 scale-125 p-8">
          {Array.from({ length: 36 }).map((_, index) => (
            <span
              key={index}
              className="whitespace-nowrap text-sm font-semibold tracking-wide text-white"
            >
              {watermark}
            </span>
          ))}
        </div>
      </div>

      <div
        id="exam-secure-hide-layer"
        aria-hidden={!hidden}
        className={`fixed inset-0 z-[90] flex items-center justify-center bg-slate-950 px-6 text-center transition-none ${
          hidden ? "" : "invisible pointer-events-none"
        }`}
        style={hidden ? undefined : { visibility: "hidden" }}
      >
        <div className="max-w-md space-y-3">
          <p className="text-lg font-bold text-white">Nội dung bài thi đã được ẩn</p>
          <p className="text-sm text-slate-300">
            Không được chụp màn hình, chuyển tab hoặc rời ứng dụng khi đang thi.
            Quay lại màn hình làm bài để tiếp tục.
          </p>
        </div>
      </div>
    </>
  )
}

export function setExamSecureHideLayerVisible(visible: boolean) {
  const layer = document.getElementById("exam-secure-hide-layer")
  if (!layer) return
  if (visible) {
    layer.style.visibility = "visible"
    layer.classList.remove("invisible", "pointer-events-none")
  } else {
    layer.style.visibility = "hidden"
    layer.classList.add("invisible", "pointer-events-none")
  }
}

export function setExamSecureWatermarkVisible(visible: boolean) {
  const layer = document.getElementById("exam-secure-watermark-layer")
  if (!layer) return
  if (visible) {
    layer.style.visibility = "visible"
    layer.style.opacity = "0.22"
  } else {
    layer.style.visibility = "hidden"
    layer.style.opacity = "0"
  }
}
