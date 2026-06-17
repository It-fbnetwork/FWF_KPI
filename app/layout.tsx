import type React from "react"
import type { Metadata } from "next"
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

export const metadata: Metadata = {
    title: "FWF KPI",
    description: "Face Wash Fox KPI platform",
    generator: "IT Dept",
    manifest: "/manifest.webmanifest",
    icons: {
        icon: [
            { url: "/favicon.ico", sizes: "225x225", type: "image/png" },
            { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
            { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
        capable: true,
        title: "FWF KPI",
        statusBarStyle: "black-translucent",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
}
