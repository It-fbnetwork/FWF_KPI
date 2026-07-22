"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { Lock, Unlock } from "lucide-react";

type TestRecord = {
  id: string;
  title: string;
  description: string;
  questions: string[];
  durationMinutes: number;
  isLocked?: boolean;
  createdByPersonId: string;
  createdAt: string;
  updatedAt: string;
};

export default function TestsPage() {
  const { user } = useAuth();
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [questionsText, setQuestionsText] = useState("");

  const canManageTests =
    user?.role === "admin" ||
    user?.role === "ceo" ||
    (user?.role === "leader" && user?.department === "Vận hành") ||
    (user?.role === "store_trainer" && user?.department === "Cửa hàng");

  const parsedQuestions = useMemo(
    () =>
      questionsText
        .split("\n")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    [questionsText]
  );

  const loadTests = async () => {
    try {
      const res = await fetch("/api/tests", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as { tests: TestRecord[] };
      setTests(payload.tests);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!canManageTests) return;
    void loadTests();
  }, [canManageTests]);

  const handleCreateTest = async () => {
    if (!title.trim()) {
      toast({ title: "Thiếu tiêu đề bài kiểm tra", variant: "destructive" });
      return;
    }
    if (parsedQuestions.length === 0) {
      toast({ title: "Cần ít nhất 1 câu hỏi", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          durationMinutes: Number(durationMinutes) || 30,
          questions: parsedQuestions
        })
      });
      const payload = (await res.json()) as { ok: boolean; test?: TestRecord; message?: string };
      if (!res.ok || !payload.ok || !payload.test) {
        throw new Error(payload.message || "Không thể tạo bài kiểm tra");
      }

      setTests((prev) => [payload.test!, ...prev]);
      setTitle("");
      setDescription("");
      setDurationMinutes("30");
      setQuestionsText("");
      toast({ title: "Đã tạo bài kiểm tra" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Không thể tạo bài kiểm tra",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTestLock = async (test: TestRecord) => {
    const nextIsLocked = !test.isLocked;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tests/${test.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isLocked: nextIsLocked })
      });
      const payload = (await res.json()) as { ok: boolean; test?: TestRecord; message?: string };
      if (!res.ok || !payload.ok || !payload.test) {
        throw new Error(payload.message || "Không thể cập nhật trạng thái bài thi");
      }
      setTests((prev) => prev.map((item) => (item.id === payload.test!.id ? payload.test! : item)));
      toast({ title: nextIsLocked ? "Đã khóa bài thi" : "Đã mở khóa bài thi" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Không thể cập nhật trạng thái bài thi",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManageTests) {
    return (
      <div className="p-3 sm:p-4 lg:p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tạo bài kiểm tra</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Chức năng này chỉ dành cho Leader phòng Vận hành.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 sm:p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tạo bài kiểm tra</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Tạo và quản lý bộ câu hỏi kiểm tra cho team Vận hành.
        </p>
      </div>

      <Card className="bg-white dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-lg">Bài kiểm tra mới</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Tiêu đề bài kiểm tra"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Textarea
            placeholder="Mô tả (tuỳ chọn)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Input
            type="number"
            min={5}
            placeholder="Thời lượng (phút)"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
          <Textarea
            placeholder={"Mỗi dòng là 1 câu hỏi\nVí dụ:\nKPI tuần này của bạn là gì?\nBạn xử lý ticket quá hạn như thế nào?"}
            value={questionsText}
            onChange={(event) => setQuestionsText(event.target.value)}
            rows={7}
          />
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Số câu hỏi: {parsedQuestions.length}
            </span>
            <Button onClick={() => void handleCreateTest()} disabled={isSubmitting} className="w-full sm:w-auto">
              Tạo bài kiểm tra
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Danh sách bài kiểm tra</h2>
        {tests.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có bài kiểm tra nào.</p>
        ) : (
          <div className="space-y-3">
            {tests.map((test) => (
              <Card key={test.id} className="bg-white dark:bg-gray-800">
                <CardContent className="pt-5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white">{test.title}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          test.isLocked
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        }`}>
                          {test.isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          {test.isLocked ? "Đang khóa" : "Đang mở"}
                        </span>
                      </div>
                      {test.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-300">{test.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{test.durationMinutes} phút</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isSubmitting}
                        onClick={() => void handleToggleTestLock(test)}
                        aria-label={test.isLocked ? "Mở khóa bài thi" : "Khóa bài thi"}
                        title={test.isLocked ? "Mở khóa bài thi" : "Khóa bài thi"}
                      >
                        {test.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {test.questions.length} câu hỏi • {new Date(test.createdAt).toLocaleString("vi-VN")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
