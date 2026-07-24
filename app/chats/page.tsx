"use client"

import { useEffect, useMemo, useState } from "react"
import { subscribeToPersonChannel } from "@/lib/client/realtime"
import { useAuth } from "@/components/auth-provider"
import { useDirectory } from "@/components/directory-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { isAdminLikeRole } from "@/lib/auth"
import { findPersonForAuthUser, isPersonWorking } from "@/lib/people"
import {
    Search,
    Send,
    Paperclip,
    Smile,
    MoreVertical,
    Phone,
    Video,
    Info,
    Users,
    ImageIcon,
    Trash2,
    Check,
    CheckCheck,
} from "lucide-react"

interface Message {
    id: string
    senderId: string
    content: string
    type: "text" | "image" | "file"
    fileName?: string
    mimeType?: string
    fileSize?: number
    timestamp: string
    status: "sent" | "delivered" | "read"
}

interface Chat {
    id: string
    type: "individual"
    name: string
    participants: string[]
    lastMessage: string
    lastMessageTime: string
    unreadCount: number
    avatar?: string
    messages: Message[]
    isOnline?: boolean
}

type ChatListItem = {
    id: string
    teammateId: string
    name: string
    lastMessage: string
    lastMessageTime: string
    unreadCount: number
    avatar?: string
    isOnline?: boolean
    threadId?: string
}

function getUnreadCount(messages: Message[], currentUserId: string) {
    return messages.filter((message) => message.senderId !== currentUserId && message.status !== "read").length
}

const EMOJI_OPTIONS = ["👍", "❤️", "🔥", "👏", "😊", "😂", "🎉", "📌", "✅", "🚀", "📎", "🦊"]
const MAX_CHAT_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024

function formatFileSize(size?: number) {
    if (!size) {
        return ""
    }

    if (size < 1024) {
        return `${size} B`
    }

    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default function ChatsPage() {
    const { user } = useAuth()
    const { people, teams } = useDirectory()
    const currentUser =
        findPersonForAuthUser(user, people) ??
        people[0] ?? {
            id: user?.personId ?? "guest-user",
            name: user?.name ?? "Khách",
            role: "Thành viên",
            imageURL: "/placeholder.svg",
            email: user?.email ?? "",
            workingHours: { start: "09:00", end: "17:00", timezone: "UTC" },
            team: "marketing",
        }
    const [chats, setChats] = useState<Chat[]>([])
    const [selectedChatId, setSelectedChatId] = useState<string>("")
    const [searchQuery, setSearchQuery] = useState("")
    const [newMessage, setNewMessage] = useState("")
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
    const [isSelectingChatId, setIsSelectingChatId] = useState<string | null>(null)
    const [isSendingMessage, setIsSendingMessage] = useState(false)
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
    const isAdmin = isAdminLikeRole(user?.role)

    const loadChats = async () => {
        const response = await fetch("/api/chats", {
            credentials: "include",
            cache: "no-store",
        })

        if (!response.ok) {
            throw new Error("Không thể tải cuộc trò chuyện.")
        }

        const payload = (await response.json()) as {
            currentUserId: string
            threads: Array<{
                id: string
                participantIds: string[]
                messages: Message[]
                lastMessage: string
                lastMessageAt: string
            }>
        }

        const nextChats = payload.threads.map((thread) => {
            const teammate = people.find(
                (person) => thread.participantIds.includes(person.id) && person.id !== payload.currentUserId,
            )

            return {
                id: thread.id,
                type: "individual" as const,
                name: teammate?.name ?? "Không xác định",
                participants: thread.participantIds,
                lastMessage: thread.lastMessage,
                lastMessageTime: thread.lastMessageAt,
                unreadCount: getUnreadCount(thread.messages, payload.currentUserId),
                avatar: teammate?.imageURL,
                isOnline: teammate ? isPersonWorking(teammate) : false,
                messages: thread.messages,
            }
        })

        setChats(nextChats)
    }

    useEffect(() => {
        if (!currentUser?.id || people.length === 0) {
            return
        }

        loadChats().catch(() => {
            setChats([])
        })
    }, [currentUser?.id, people])

    useEffect(() => {
        if (!currentUser?.id) {
            return
        }

        return subscribeToPersonChannel(currentUser.id, (message) => {
            const payload = message.data as { type?: string } | undefined
            if (!payload?.type?.startsWith("chat.")) {
                return
            }

            void loadChats().catch(() => {
                // Keep current UI state if a background refresh fails.
            })
        })
    }, [currentUser?.id, people.length])

    const availableContacts = useMemo(
        () =>
            people.filter((person) => {
                if (person.id === currentUser.id) {
                    return false
                }

                if (isAdmin) {
                    return true
                }

                const personRole = person.role.toLowerCase()
                return person.team === currentUser.team || personRole === "admin" || personRole === "ceo"
            }),
        [currentUser.id, currentUser.team, isAdmin, people],
    )

    const chatListItems = useMemo(() => {
        const existingTeammateIds = new Set<string>()
        const threadItems: ChatListItem[] = chats.map((chat) => {
            const teammateId = chat.participants.find((participantId) => participantId !== currentUser.id) ?? ""
            if (teammateId) {
                existingTeammateIds.add(teammateId)
            }

            return {
                id: chat.id,
                teammateId,
                name: chat.name,
                lastMessage: chat.lastMessage,
                lastMessageTime: chat.lastMessageTime,
                unreadCount: chat.unreadCount,
                avatar: chat.avatar,
                isOnline: chat.isOnline,
                threadId: chat.id,
            }
        })

        const contactItems: ChatListItem[] = availableContacts
            .filter((person) => !existingTeammateIds.has(person.id))
            .map((person) => ({
                id: `contact-${person.id}`,
                teammateId: person.id,
                name: person.name,
                lastMessage: "Bắt đầu cuộc trò chuyện mới",
                lastMessageTime: "",
                unreadCount: 0,
                avatar: person.imageURL,
                isOnline: isPersonWorking(person),
            }))

        return [...threadItems, ...contactItems]
    }, [availableContacts, chats, currentUser.id])

    const filteredChats = useMemo(
        () =>
            chatListItems.filter(
                (chat) =>
                    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()),
            ),
        [chatListItems, searchQuery],
    )

    useEffect(() => {
        if (!filteredChats.some((chat) => chat.id === selectedChatId)) {
            setSelectedChatId(filteredChats[0]?.id ?? "")
        }
    }, [filteredChats, selectedChatId])

    useEffect(() => {
        if (!selectedChatId) {
            return
        }

        const targetChat = chats.find((chat) => chat.id === selectedChatId)
        if (!targetChat) {
            return
        }

        const hasUnreadMessages = targetChat.messages.some(
            (message) => message.senderId !== currentUser.id && message.status !== "read",
        )

        if (!hasUnreadMessages) {
            return
        }

        fetch("/api/chats", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ threadId: selectedChatId }),
        }).then(() => loadChats())
    }, [chats, currentUser.id, selectedChatId])

    const selectedChat = filteredChats.find((chat) => chat.id === selectedChatId)
    const selectedThread = chats.find((chat) => chat.id === selectedChatId)
    const selectedChatMeta =
        selectedChat ??
        (selectedThread
            ? {
                id: selectedThread.id,
                teammateId: selectedThread.participants.find((participantId) => participantId !== currentUser.id) ?? "",
                name: selectedThread.name,
                lastMessage: selectedThread.lastMessage,
                lastMessageTime: selectedThread.lastMessageTime,
                unreadCount: selectedThread.unreadCount,
                avatar: selectedThread.avatar,
                isOnline: selectedThread.isOnline,
                threadId: selectedThread.id,
            }
            : null)

    const handleSelectChat = async (chat: ChatListItem) => {
        if (isSelectingChatId) {
            return
        }

        if (chat.threadId) {
            setSelectedChatId(chat.threadId)
            return
        }

        setIsSelectingChatId(chat.id)
        try {
            const response = await fetch("/api/chats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    teammateId: chat.teammateId,
                }),
            })

            if (!response.ok) {
                return
            }

            const payload = (await response.json()) as { ok: boolean; threadId?: string }
            if (!payload.ok || !payload.threadId) {
                return
            }

            await loadChats()
            setSelectedChatId(payload.threadId)
        } finally {
            setIsSelectingChatId(null)
        }
    }

    const handleSendMessage = async (
        overrides?: {
            content: string
            type?: "text" | "image" | "file"
            fileName?: string
            mimeType?: string
            fileSize?: number
        },
    ) => {
        const payload = {
            content: overrides?.content ?? newMessage.trim(),
            type: overrides?.type ?? "text",
            fileName: overrides?.fileName,
            mimeType: overrides?.mimeType,
            fileSize: overrides?.fileSize,
        }

        if (!payload.content || !selectedThread || isSendingMessage) {
            return
        }

        setIsSendingMessage(true)
        try {
            const response = await fetch("/api/chats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    threadId: selectedThread.id,
                    content: payload.content,
                    type: payload.type,
                    fileName: payload.fileName,
                    mimeType: payload.mimeType,
                    fileSize: payload.fileSize,
                }),
            })

            if (!response.ok) {
                return
            }

            await loadChats()
            if (!overrides) {
                setNewMessage("")
            }
        } finally {
            setIsSendingMessage(false)
        }
    }

    const convertFileToDataUrl = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
            reader.onerror = () => reject(new Error("Không thể đọc tệp đã chọn."))
            reader.readAsDataURL(file)
        })

    const handleUploadAsset = async (event: React.ChangeEvent<HTMLInputElement>, mode: "image" | "file") => {
        const file = event.target.files?.[0]
        event.target.value = ""

        if (!file || !selectedThread || isSendingMessage) {
            return
        }

        if (mode === "image" && !file.type.startsWith("image/")) {
            return
        }

        if (file.size > MAX_CHAT_UPLOAD_SIZE_BYTES) {
            return
        }

        try {
            const content = await convertFileToDataUrl(file)
            await handleSendMessage({
                content,
                type: mode,
                fileName: file.name,
                mimeType: file.type,
                fileSize: file.size,
            })
        } catch {
            // Ignore file read failures for now.
        }
    }

    const handleInsertEmoji = (emoji: string) => {
        setNewMessage((prev) => `${prev}${emoji}`)
        setIsEmojiPickerOpen(false)
    }

    const getMessageStatus = (status: Message["status"]) => {
        switch (status) {
            case "sent":
                return <Check className="w-3 h-3 text-gray-400" />
            case "delivered":
                return <CheckCheck className="w-3 h-3 text-gray-400" />
            case "read":
                return <CheckCheck className="w-3 h-3 text-blue-500" />
            default:
                return null
        }
    }

    const handleDeleteMessage = async (messageId: string) => {
        if (!selectedChat || deletingMessageId) {
            return
        }

        setDeletingMessageId(messageId)
        try {
            const response = await fetch("/api/chats", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    threadId: selectedChat.id,
                    messageId,
                }),
            })

            if (!response.ok) {
                return
            }

            await loadChats()
        } finally {
            setDeletingMessageId(null)
        }
    }

    return (
        <div className="flex h-[calc(100vh-120px)]">
            <div className="flex w-80 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <div className="border-b border-gray-200 p-4 dark:border-gray-700">
                        <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Tin nhắn</h1>
                        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                            {isAdmin
                                ? "Quản trị viên có thể nhắn tin với tất cả nhân sự trong hệ thống."
                                : `Hiển thị thành viên cùng nhóm ${teams.find((team) => team.id === currentUser.team)?.name ?? "Marketing"} và các tài khoản quản trị viên/CEO.`}
                        </p>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400 dark:text-gray-500" />
                        <Input
                            placeholder="Tìm cuộc trò chuyện..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-white pl-10 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredChats.map((chat) => (
                        <div
                            key={chat.id}
                            onClick={() => void handleSelectChat(chat)}
                            className={`border-b border-gray-100 p-4 transition-colors dark:border-gray-700 ${isSelectingChatId ? "cursor-wait" : "cursor-pointer"} ${selectedChatId === chat.id ? "border-r-2 border-r-blue-500 bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700"
                                } ${isSelectingChatId && isSelectingChatId !== chat.id ? "pointer-events-none opacity-60" : ""
                                }`}
                        >
                            <div className="flex items-start space-x-3">
                                <div className="relative">
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={chat.avatar || "/placeholder.svg"} />
                                        <AvatarFallback className="bg-gray-200 text-gray-900 dark:bg-gray-600 dark:text-white">
                                            {chat.name
                                                .split(" ")
                                                .map((n) => n[0])
                                                .join("")}
                                        </AvatarFallback>
                                    </Avatar>
                                    {chat.isOnline && (
                                        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-green-500 dark:border-gray-800" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{chat.name}</h3>
                                        <div className="flex items-center space-x-2">
                                            {chat.lastMessageTime ? (
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{chat.lastMessageTime}</span>
                                            ) : null}
                                            {chat.unreadCount > 0 && (
                                                <Badge className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-2 py-1 text-xs text-white">
                                                    {chat.unreadCount}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                            <p className="mt-1 truncate text-sm text-gray-600 dark:text-gray-400">
                                                {isSelectingChatId === chat.id ? "Đang mở cuộc trò chuyện..." : chat.lastMessage}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                    ))}
                </div>
            </div>

            <div className="flex flex-1 flex-col bg-gray-50 dark:bg-gray-900">
                {selectedThread ? (
                    <>
                        <div className="border-b border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="relative">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={selectedChatMeta?.avatar || "/placeholder.svg"} />
                                            <AvatarFallback className="bg-gray-200 text-gray-900 dark:bg-gray-600 dark:text-white">
                                                {(selectedChatMeta?.name ?? "Không xác định")
                                                    .split(" ")
                                                    .map((n) => n[0])
                                                    .join("")}
                                            </AvatarFallback>
                                        </Avatar>
                                        {selectedChatMeta?.isOnline && (
                                            <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-gray-800" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedChatMeta?.name ?? "Không xác định"}</h2>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {selectedChatMeta?.isOnline ? "Đang hoạt động" : "Hoạt động gần đây"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Button variant="ghost" size="icon">
                                        <Phone className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon">
                                        <Video className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon">
                                        <Info className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon">
                                        <MoreVertical className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto p-4">
                            {selectedThread.messages.map((message) => {
                                const sender = people.find((p) => p.id === message.senderId)
                                const isCurrentUser = message.senderId === currentUser.id
                                const senderName = sender?.name || "Không xác định"

                                return (
                                    <div key={message.id} className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}>
                                        <div className="flex max-w-xs items-end space-x-2 lg:max-w-md">
                                            {!isCurrentUser && (
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={sender?.imageURL || "/placeholder.svg"} />
                                                    <AvatarFallback className="bg-gray-200 text-xs text-gray-900 dark:bg-gray-600 dark:text-white">
                                                        {senderName
                                                            .split(" ")
                                                            .map((n) => n[0])
                                                            .join("")}
                                                    </AvatarFallback>
                                                </Avatar>
                                            )}
                                            <div className={`flex flex-col ${isCurrentUser ? "items-end" : "items-start"}`}>
                                                <div className="flex items-start gap-2">
                                                    <div
                                                    className={`rounded-2xl px-4 py-2 ${isCurrentUser
                                                            ? "bg-blue-500 text-white"
                                                            : "border border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                        }`}
                                                    >
                                                        {message.type === "text" ? (
                                                            <p className="text-sm">{message.content}</p>
                                                        ) : message.type === "image" ? (
                                                            <div className="overflow-hidden rounded-lg">
                                                                <img
                                                                    src={message.content || "/placeholder.svg"}
                                                                    alt="Ảnh đã chia sẻ"
                                                                    className="h-auto max-w-full rounded-lg"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <a
                                                                href={message.content}
                                                                download={message.fileName || "attachment"}
                                                                className={`block rounded-xl border px-3 py-2 text-sm ${isCurrentUser
                                                                    ? "border-white/20 bg-white/10 text-white"
                                                                    : "border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                                                                    }`}
                                                            >
                                                                <div className="font-medium">{message.fileName || "Tệp đính kèm"}</div>
                                                                <div className={`text-xs ${isCurrentUser ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
                                                                    {formatFileSize(message.fileSize) || "Tải xuống"}
                                                                </div>
                                                            </a>
                                                        )}
                                                    </div>
                                                    {isCurrentUser ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            loading={deletingMessageId === message.id}
                                                            className="h-7 w-7 shrink-0 text-gray-400 hover:text-red-500"
                                                            onClick={() => void handleDeleteMessage(message.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    ) : null}
                                                </div>
                                                <div className={`mt-1 flex items-center space-x-1 ${isCurrentUser ? "flex-row-reverse space-x-reverse" : ""}`}>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{message.timestamp}</span>
                                                    {isCurrentUser && getMessageStatus(message.status)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="flex items-center space-x-2">
                                <label className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 ${isSendingMessage || !selectedThread ? "pointer-events-none opacity-50" : ""}`}>
                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={(event) => void handleUploadAsset(event, "file")}
                                        disabled={isSendingMessage || !selectedThread}
                                    />
                                    <Paperclip className="w-4 h-4" />
                                </label>
                                <label className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 ${isSendingMessage || !selectedThread ? "pointer-events-none opacity-50" : ""}`}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(event) => void handleUploadAsset(event, "image")}
                                        disabled={isSendingMessage || !selectedThread}
                                    />
                                    <ImageIcon className="w-4 h-4" />
                                </label>
                                <div className="relative flex-1">
                                    <Input
                                        placeholder={`Nhắn cho ${selectedChatMeta?.name ?? "đồng đội"}...`}
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && void handleSendMessage()}
                                        disabled={isSendingMessage}
                                        className="bg-gray-100 pr-10 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    />
                                    <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
                                        <PopoverTrigger asChild>
                                            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 transform">
                                                <Smile className="w-4 h-4" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3" align="end">
                                            <div className="grid grid-cols-6 gap-2">
                                                {EMOJI_OPTIONS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        className="rounded-lg p-2 text-xl transition hover:bg-gray-100"
                                                        onClick={() => handleInsertEmoji(emoji)}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <Button onClick={() => void handleSendMessage()} disabled={!newMessage.trim() || isSendingMessage} loading={isSendingMessage}>
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Hỗ trợ gửi ảnh và tệp tối đa 2MB.</p>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                                <Users className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                            </div>
                            <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
                                {filteredChats.length > 0 ? "Chọn một cuộc trò chuyện" : "Chưa có cuộc trò chuyện nào"}
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400">
                                {filteredChats.length > 0
                                    ? "Chọn một người ở danh sách bên trái để bắt đầu nhắn tin."
                                    : isAdmin
                                        ? "Quản trị viên có thể nhắn tin với tất cả nhân sự khi có dữ liệu người dùng trong hệ thống."
                                        : "Tài khoản này chưa có đồng đội nào trong cùng nhóm để bắt đầu nhắn tin."}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
