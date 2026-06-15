"use client"

import dynamic from "next/dynamic"
import { GraduationCap, Loader2 } from "lucide-react"

const DocumentsWorkspace = dynamic(() => import("@/components/documents/documents-workspace"), {
    ssr: false,
    loading: () => (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
                <GraduationCap className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <Loader2 className="h-6 w-6 animate-spin text-violet-600 dark:text-violet-400" />
            <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Đang tải E-learning...</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lần đầu có thể mất vài giây.</p>
            </div>
        </div>
    ),
})

export default function DocumentsPage() {
    return <DocumentsWorkspace />
}
