export interface Folder {
  id: string;
  name: string;
  ownerId: string;
  teamId: string;
  createdAt: string;
  updatedAt: string;
}

export type LearningStepMedia = {
  id: string;
  type: "video";
  url: string;
  mimeType?: string;
  fileName?: string;
};

export type LearningStep = {
  id: string;
  title: string;
  kind: "page" | "slide";
  pageNumber?: number;
  slideNumber?: number;
  content?: string;
  estimatedSeconds: number;
  media?: LearningStepMedia[];
};

export type LearningPlan = {
  sourceType: "pdf" | "pptx";
  steps: LearningStep[];
  generatedAt: string;
  previewUrl?: string;
};

export interface Document {
  id: string;
  name: string;
  type:
    | "pdf"
    | "docx"
    | "xlsx"
    | "pptx"
    | "txt"
    | "jpg"
    | "png"
    | "mp4"
    | "zip"
    | "figma"
    | "link"
    | "image";
  size: number; // in bytes
  ownerId: string;
  createdAt: string;
  modifiedAt: string;
  folder?: string;
  folderId?: string;
  tags: string[];
  isStarred: boolean;
  thumbnail?: string;
  description?: string;
  url?: string;
  visibility: "team" | "office" | "store" | "specific";
  visibleToPersonIds: string[];
  isLearningMaterial?: boolean;
  learningPlan?: LearningPlan;
  deadlineAt?: string;
  isLocked?: boolean;
  lockedAt?: string;
  lockedByUserId?: string;
}

export const documentTypes = {
  pdf: {
    icon: "📄",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-900/20",
  },
  docx: {
    icon: "📝",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
  },
  xlsx: {
    icon: "📊",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-900/20",
  },
  pptx: {
    icon: "📋",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
  },
  txt: {
    icon: "📃",
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-900/20",
  },
  jpg: {
    icon: "🖼️",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
  },
  png: {
    icon: "🖼️",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
  },
  mp4: {
    icon: "🎥",
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-900/20",
  },
  zip: {
    icon: "🗜️",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
  },
  figma: {
    icon: "🎨",
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
  },
  link: {
    icon: "🔗",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-900/20",
  },
  image: {
    icon: "🖼️",
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-900/20",
  },
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  );
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "Today";
  if (diffDays === 2) return "Yesterday";
  if (diffDays <= 7) return `${diffDays - 1} days ago`;

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
