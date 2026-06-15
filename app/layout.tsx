import type React from "react"
import type { Viewport } from "next"
import "./globals.css"
import ClientLayout from "./client-layout"
import { AuthProvider } from "@/components/auth-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="font-sans">
                <AuthProvider>
                    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
                        <ClientLayout>{children}</ClientLayout>
                        <Toaster />
                    </ThemeProvider>
                </AuthProvider>
            </body>
        </html>
    )
}

export const metadata = {

    title: "FWF KPI",
    description: "Face Wash Fox KPI platform",
    generator: "IT Dept",


};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
}
