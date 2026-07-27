"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COMPANY_DOMAIN, departments, registrationRoles, storeRegistrationRoles, type Department, type UserRole } from "@/lib/auth";
import {
  STORE_BRANCHES_BY_REGION,
  STORE_REGIONS,
  type StoreRegion
} from "@/lib/store-branches";

type AuthMode = "login" | "register";
type EmailMode = "company" | "external";

const roleLabels: Record<UserRole, string> = {
  admin: "Quản trị viên",
  ceo: "CEO",
  employee: "Nhân viên",
  leader: "Trưởng nhóm",
  store_staff: "Nhân viên cửa hàng",
  store_trainer: "Đào tạo viên",
  store_manager: "Quản lí khu vực",
  store_lead: "Cửa hàng trưởng",
  store_technician: "Kỹ thuật viên"
};

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
};

function InputField({ label, value, onChange, type = "text", placeholder }: FieldProps) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-text">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-2xl border border-[rgba(55,45,33,0.12)] bg-white/85 px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-ink dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
    </label>
  );
}

function extractEmailLocalPart(email: string) {
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    return "";
  }

  return normalizedEmail.split("@")[0] ?? "";
}

function normalizeCompanyEmailInput(value: string) {
  const localPart = value.replace(/\s+/g, "").split("@")[0]?.trim() ?? "";
  return localPart ? `${localPart}${COMPANY_DOMAIN}` : "";
}

function normalizeExternalEmailInput(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function CompanyEmailField({ value, onChange }: Pick<FieldProps, "value" | "onChange">) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-text">Email công ty</span>
      <div className="flex items-center rounded-2xl border border-[rgba(55,45,33,0.12)] bg-white/85 px-4 py-3 transition focus-within:border-ink dark:border-slate-600 dark:bg-slate-900/70">
        <input
          type="text"
          value={extractEmailLocalPart(value)}
          onChange={(event) => onChange(normalizeCompanyEmailInput(event.target.value))}
          placeholder="yourname"
          className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-400"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <span className="ml-2 shrink-0 font-medium text-[#dd6b4d] dark:text-orange-300">{COMPANY_DOMAIN}</span>
      </div>
    </label>
  );
}

function ExternalEmailField({ value, onChange }: Pick<FieldProps, "value" | "onChange">) {
  return (
    <InputField
      label="Email cá nhân"
      value={value}
      onChange={(nextValue) => onChange(normalizeExternalEmailInput(nextValue))}
      placeholder="you@example.com"
      type="email"
    />
  );
}

function maskEmail(email: string) {
  const normalizedEmail = email.trim();
  const [localPart = "", domain = ""] = normalizedEmail.split("@");

  if (!localPart || !domain) {
    return normalizedEmail;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] ?? ""}***@${domain}`;
  }

  return `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domain}`;
}

export function AuthShell({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { requestLoginOtp, verifyLoginOtp, requestRegistrationOtp, verifyRegistrationOtp, refreshSession, users } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailMode, setEmailMode] = useState<EmailMode>("company");
  const [department, setDepartment] = useState<Department>("IT");
  const [role, setRole] = useState<UserRole>("employee");
  const [storeRegion, setStoreRegion] = useState<StoreRegion>("Hồ Chí Minh");
  const [storeBranchIds, setStoreBranchIds] = useState<number[]>([]);
  const [storeLeadUserId, setStoreLeadUserId] = useState("");
  const [otp, setOtp] = useState("");
  const [otpPreview, setOtpPreview] = useState("");
  const [loginStep, setLoginStep] = useState<"form" | "otp">("form");
  const [registerStep, setRegisterStep] = useState<"form" | "otp">("form");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const selectClassName =
    "rounded-2xl border border-[rgba(55,45,33,0.14)] bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-orange-200/60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-orange-400/20";
  const [resendCountdown, setResendCountdown] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isManagerPickerOpen, setIsManagerPickerOpen] = useState(false);

  const availableRoles = useMemo(() => {
    if (department === "Cửa hàng") return storeRegistrationRoles;
    return registrationRoles.filter((r) => !storeRegistrationRoles.includes(r as typeof storeRegistrationRoles[number]));
  }, [department]);

  useEffect(() => {
    if (department === "Cửa hàng" && !storeRegistrationRoles.includes(role as typeof storeRegistrationRoles[number])) {
      setRole("store_technician");
    } else if (department !== "Cửa hàng" && storeRegistrationRoles.includes(role as typeof storeRegistrationRoles[number])) {
      setRole("employee");
    }
  }, [department, role]);

  useEffect(() => {
    if (role !== "store_technician") {
      setStoreLeadUserId("");
    }
  }, [role]);

  const regionBranches = useMemo(() => STORE_BRANCHES_BY_REGION[storeRegion] ?? [], [storeRegion]);
  const isStoreManagerRole = role === "store_manager";
  const isStoreDepartment = department === "Cửa hàng";
  const isStoreTechnicianRole = role === "store_technician";
  const isStoreTrainerRole = role === "store_trainer";
  const storeBranchSelectionLimit = isStoreManagerRole ? 5 : 1;
  const storeLeadOptions = useMemo(
    () => users.filter((user) => user.department === "Cửa hàng" && user.role === "store_lead" && user.verified),
    [users]
  );
  const managerOptionsForTechnician = storeLeadOptions;
  const technicianManagerDisplay = useMemo(() => {
    if (!storeLeadUserId) {
      return "Không có";
    }

    const selectedLead = managerOptionsForTechnician.find((item) => item.id === storeLeadUserId);
    if (selectedLead) {
      return `${selectedLead.name} (${selectedLead.email})`;
    }

    return "Không có";
  }, [managerOptionsForTechnician, storeLeadUserId]);

  useEffect(() => {
    if (!isStoreTechnicianRole) return;
    if (!storeLeadUserId) return;
    if (managerOptionsForTechnician.some((item) => item.id === storeLeadUserId)) return;

    setStoreLeadUserId("");
  }, [isStoreTechnicianRole, managerOptionsForTechnician, storeLeadUserId]);

  useEffect(() => {
    setStoreBranchIds((prev) => prev.filter((id) => regionBranches.some((branch) => branch.id === id)));
  }, [regionBranches]);

  const normalizedStoreRegion = isStoreDepartment && !isStoreTrainerRole
    ? storeRegion
    : undefined;
  const normalizedStoreBranchIds = isStoreDepartment && !isStoreTrainerRole
    ? storeBranchIds
    : undefined;

  const maskedEmail = useMemo(() => maskEmail(email), [email]);
  const isCeoRole = role === "ceo";
  const effectiveDepartment: Department = isCeoRole ? "Vận hành" : department;
  const isOtpStep = mode === "login" ? loginStep === "otp" : registerStep === "otp";
  const isExternalEmail = emailMode === "external";

  function switchEmailMode(nextMode: EmailMode) {
    if (isOtpStep || nextMode === emailMode) {
      return;
    }

    setEmailMode(nextMode);
    if (nextMode === "company") {
      const localPart = extractEmailLocalPart(email);
      setEmail(localPart ? `${localPart}${COMPANY_DOMAIN}` : "");
      return;
    }

    setEmail("");
  }

  useEffect(() => {
    if (!isOtpStep || resendCountdown <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setResendCountdown((prev) => prev - 1);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [isOtpStep, resendCountdown]);

  async function handleResendOtp() {
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    const result =
      mode === "login"
        ? await requestLoginOtp(email)
        : await requestRegistrationOtp({
          name,
          email,
          role,
          department: effectiveDepartment,
          storeRegion: normalizedStoreRegion,
          storeBranchIds: normalizedStoreBranchIds,
          storeLeadUserId: isStoreDepartment && isStoreTechnicianRole ? storeLeadUserId : undefined
        });

    if (!result.ok) {
      setError(result.message ?? "Gửi lại OTP thất bại.");
      setIsSubmitting(false);
      return;
    }

    setOtp("");
    setOtpPreview(result.otp ?? "");
    setResendCountdown(30);
    setSuccess("Mã OTP mới đã được gửi tới email đã đăng ký.");
    setIsSubmitting(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    if (mode === "login") {
      if (loginStep === "form") {
        const result = await requestLoginOtp(email);
        if (!result.ok) {
          setError(result.message ?? "Gửi OTP đăng nhập thất bại.");
          setIsSubmitting(false);
          return;
        }

        setOtp("");
        setOtpPreview(result.otp ?? "");
        setLoginStep("otp");
        setResendCountdown(30);
        setSuccess("OTP đăng nhập đã được gửi tới email đã đăng ký.");
        setIsSubmitting(false);
        return;
      }

      const result = await verifyLoginOtp(email, otp);
      if (!result.ok) {
        setError(result.message ?? "Xác minh OTP đăng nhập thất bại.");
        setIsSubmitting(false);
        return;
      }
      await refreshSession();
      router.replace("/dashboard" as Route);
      return;
    }

    if (!name.trim()) {
      setError("Vui lòng nhập họ và tên.");
      setIsSubmitting(false);
      return;
    }

    if (registerStep === "form" && isStoreDepartment) {
      if (!isStoreTrainerRole) {
        if (storeBranchIds.length === 0) {
          setError("Phòng ban Cửa hàng bắt buộc chọn ít nhất 1 chi nhánh.");
          setIsSubmitting(false);
          return;
        }
        if (isStoreManagerRole && storeBranchIds.length > 5) {
          setError("Quản lí khu vực chỉ được chọn tối đa 5 cửa hàng.");
          setIsSubmitting(false);
          return;
        }
        if (!isStoreManagerRole && storeBranchIds.length !== 1) {
          setError("Vai trò này chỉ được chọn đúng 1 chi nhánh.");
          setIsSubmitting(false);
          return;
        }
      } else {
        // Trainer does not need region/branch on registration.
      }
    }

    if (registerStep === "form" && isStoreTechnicianRole && storeLeadUserId && !managerOptionsForTechnician.some((item) => item.id === storeLeadUserId)) {
      setError("Người quản lý đã chọn không hợp lệ.");
        setIsSubmitting(false);
        return;
    }

    if (registerStep === "form") {
      const result = await requestRegistrationOtp({
        name,
        email,
        role,
        department: effectiveDepartment,
        storeRegion: normalizedStoreRegion,
        storeBranchIds: normalizedStoreBranchIds,
        storeLeadUserId: isStoreDepartment && isStoreTechnicianRole ? storeLeadUserId : undefined
      });

      if (!result.ok) {
        setError(result.message ?? "Gửi OTP thất bại.");
        setIsSubmitting(false);
        return;
      }

      setOtpPreview(result.otp ?? "");
      setRegisterStep("otp");
      setResendCountdown(30);
      setSuccess(
        role === "admin" || role === "ceo" || isExternalEmail
          ? "OTP đã được gửi. Sau khi xác thực, tài khoản sẽ chuyển sang trạng thái chờ quản trị viên/CEO duyệt trước khi sử dụng."
          : "OTP đã được gửi tới email công ty. Nhập mã xác nhận để hoàn tất đăng ký."
      );
      setIsSubmitting(false);
      return;
    }

    const result = await verifyRegistrationOtp(email, otp);

    if (!result.ok) {
      setError(result.message ?? "Xác minh OTP thất bại.");
      setIsSubmitting(false);
      return;
    }

    if (result.requiresApproval) {
      setError("");
      setSuccess(result.message ?? "Tài khoản đang chờ quản trị viên gốc duyệt.");
      setRegisterStep("form");
      setOtp("");
      setOtpPreview("");
      setName("");
      setEmail("");
      setEmailMode("company");
      setRole("employee");
      setDepartment("IT");
      setStoreRegion("Hồ Chí Minh");
      setStoreBranchIds([]);
      setStoreLeadUserId("");
      setIsSubmitting(false);
      return;
    }

    await refreshSession();
    router.replace("/dashboard" as Route);
  }

  return (
    <div className="grid min-h-screen gap-6 p-4 lg:grid-cols-[1.1fr_0.9fr] lg:p-6">
      <section
        className={`relative hidden overflow-hidden rounded-[32px] bg-cover bg-center bg-no-repeat p-8 text-white shadow-float lg:block lg:p-10 ${
          mode === "login" ? "bg-[url('/cao_kpi.jpg')]" : "bg-[url('/cao_register.jpg')]"
        }`}
      >

        <div className="relative z-10">




          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/76">

          </p>


        </div>
      </section>

      <section className="rounded-[28px] border border-[rgba(55,45,33,0.12)] bg-[rgba(255,252,247,0.8)] p-4 shadow-float backdrop-blur-xl sm:p-6 lg:rounded-[32px] lg:p-10">
        <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted">
          {mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </p>
        <h2 className="text-2xl font-semibold text-text sm:text-3xl">
          {mode === "login"
            ? loginStep === "form"
              ? "Đăng nhập tài khoản"
              : "Xác nhận OTP đăng nhập"
            : registerStep === "form"
              ? "Tạo tài khoản theo phòng ban"
              : "Xác nhận email bằng OTP"}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          {mode === "login"
            ? loginStep === "form"
              ? "Nhập email công ty hoặc email cá nhân để nhận OTP đăng nhập."
              : "Nhập mã OTP đã gửi tới email của bạn để hoàn tất đăng nhập."
            : registerStep === "form"
              ? "Đăng ký bằng email công ty hoặc email cá nhân, chọn phòng ban và vai trò rồi xác thực bằng OTP."
              : "Tài khoản chỉ được tạo sau khi OTP được xác nhận thành công."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:mt-8 sm:gap-5">
          {mode === "register" && registerStep === "form" ? (
            <InputField
              label="Họ và tên"
              value={name}
              onChange={setName}
              placeholder="Ví dụ: Nguyen Van A"
            />
          ) : null}

          <div className="grid gap-2">
            <span className="text-sm font-medium text-text">Loại email</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isOtpStep}
                onClick={() => switchEmailMode("company")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  emailMode === "company"
                    ? "border-ink bg-orange-500 text-white"
                    : "border-[rgba(55,45,33,0.12)] bg-white/70 text-black"
                } ${isOtpStep ? "cursor-not-allowed opacity-60" : ""}`}
              >
                Email công ty
              </button>
              <button
                type="button"
                disabled={isOtpStep}
                onClick={() => switchEmailMode("external")}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  emailMode === "external"
                    ? "border-ink bg-orange-500 text-white"
                    : "border-[rgba(55,45,33,0.12)] bg-white/70 text-black"
                } ${isOtpStep ? "cursor-not-allowed opacity-60" : ""}`}
              >
                Email cá nhân
              </button>
            </div>
          </div>

          {emailMode === "company" ? (
            <CompanyEmailField value={email} onChange={setEmail} />
          ) : (
            <ExternalEmailField value={email} onChange={setEmail} />
          )}

          {mode === "register" && registerStep === "form" ? (
            <>
              {!isCeoRole ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-text">Phòng ban</span>
                  <select
                    value={department}
                    onChange={(event) => setDepartment(event.target.value as Department)}
                    className={selectClassName}
                  >
                    {departments.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="grid gap-2">
                <span className="text-sm font-medium text-text">Vai trò</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as UserRole)}
                  className={selectClassName}
                >
                  {availableRoles.map((item) => (
                    <option key={item} value={item}>
                      {roleLabels[item]}
                    </option>
                  ))}
                </select>
              </label>

              {isStoreDepartment ? (
                <>
                  {isStoreTrainerRole ? null : (
                    <>
                      {isStoreTechnicianRole ? (
                        <label className="grid gap-2">
                          <span className="text-sm font-medium text-text">
                            Cửa hàng trưởng quản lý
                          </span>
                          <button
                            type="button"
                            className={`${selectClassName} flex w-full items-center justify-between text-left`}
                            onClick={() => setIsManagerPickerOpen(true)}
                          >
                            <span className={storeLeadUserId ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-300"}>
                              {technicianManagerDisplay}
                            </span>
                            <span className="text-lg leading-none text-slate-500">⌄</span>
                          </button>
                          <Dialog open={isManagerPickerOpen} onOpenChange={setIsManagerPickerOpen}>
                            <DialogContent className="max-w-lg rounded-2xl border border-[rgba(55,45,33,0.15)] bg-white p-0">
                              <DialogHeader className="border-b border-[rgba(55,45,33,0.12)] px-5 py-4">
                                <DialogTitle className="text-base font-semibold text-slate-900">
                                  Chọn cửa hàng trưởng quản lý
                                </DialogTitle>
                              </DialogHeader>
                              <div className="max-h-[60vh] space-y-2 overflow-y-auto px-3 py-3">
                                <button
                                  type="button"
                                  className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-medium transition ${
                                    !storeLeadUserId
                                      ? "border-orange-300 bg-orange-50 text-slate-900"
                                      : "border-[rgba(55,45,33,0.12)] text-slate-700 hover:bg-slate-50"
                                  }`}
                                  onClick={() => {
                                    setStoreLeadUserId("");
                                    setIsManagerPickerOpen(false);
                                  }}
                                >
                                  Không có
                                </button>
                                {managerOptionsForTechnician.map((lead) => (
                                  <button
                                    key={lead.id}
                                    type="button"
                                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                                      lead.id === storeLeadUserId
                                        ? "border-orange-300 bg-orange-50 text-slate-900"
                                        : "border-[rgba(55,45,33,0.12)] text-slate-800 hover:bg-slate-50"
                                    }`}
                                    onClick={() => {
                                      setStoreLeadUserId(lead.id);
                                      setIsManagerPickerOpen(false);
                                    }}
                                  >
                                    {lead.name} ({lead.email})
                                  </button>
                                ))}
                                {managerOptionsForTechnician.length === 0 ? (
                                  <div className="rounded-xl border border-[rgba(55,45,33,0.12)] bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                    Chưa có cửa hàng trưởng khả dụng.
                                  </div>
                                ) : null}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </label>
                      ) : null}

                      {!isStoreTrainerRole ? (
                        <>
                          <label className="grid gap-2">
                            <span className="text-sm font-medium text-text">Khu vực</span>
                            <select
                              value={storeRegion}
                              onChange={(event) => setStoreRegion(event.target.value as StoreRegion)}
                              className={selectClassName}
                            >
                              {STORE_REGIONS.map((region) => (
                                <option key={region} value={region}>
                                  {region}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="grid gap-2">
                            <span className="text-sm font-medium text-text">
                              {isStoreManagerRole ? "Cửa hàng quản lí (chọn tối đa 5)" : "Chi nhánh (chọn 1)"}
                            </span>
                            <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-[rgba(55,45,33,0.12)] bg-white/75 p-3">
                              {regionBranches.map((branch) => {
                                const checked = storeBranchIds.includes(branch.id);
                                const disabled = !checked && storeBranchIds.length >= storeBranchSelectionLimit;
                                return (
                                  <label key={branch.id} className={`flex cursor-pointer items-start gap-2 rounded-xl p-2 ${disabled ? "opacity-50" : ""}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={disabled}
                                      onChange={(event) => {
                                        setStoreBranchIds((prev) => {
                                          if (event.target.checked) {
                                            if (prev.includes(branch.id) || prev.length >= storeBranchSelectionLimit) return prev;
                                            return isStoreManagerRole ? [...prev, branch.id] : [branch.id];
                                          }
                                          return prev.filter((id) => id !== branch.id);
                                        });
                                      }}
                                    />
                                    <span className="text-sm text-text">
                                      <strong>{branch.name}</strong>
                                      <br />
                                      {branch.address}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            {isStoreManagerRole ? (
                              <p className="text-xs text-muted">
                                Quản lí khu vực có thể chọn tối đa 5 cửa hàng trong khu vực đã chọn.
                              </p>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </>
              ) : null}
            </>
          ) : null}

          {isOtpStep ? (
            <>
              <div className="overflow-hidden rounded-[24px] border border-[rgba(123,145,199,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,255,0.96))] shadow-[0_18px_48px_rgba(120,146,220,0.16)] sm:rounded-[28px] sm:shadow-[0_28px_90px_rgba(120,146,220,0.18)]">
                <div className="px-4 pb-5 pt-5 text-center sm:px-8 sm:pb-8 sm:pt-8">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(92,126,255,0.12)] sm:mb-6 sm:h-20 sm:w-20">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-7 w-7 text-[#3b6af5] sm:h-10 sm:w-10"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
                      <path d="m5 7 7 5 7-5" />
                    </svg>
                  </div>
                  <h3 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-[#151b2f] sm:text-[3rem] sm:tracking-[-0.04em]">Verification Code</h3>
                  <p className="mt-2 text-[14px] text-[#7080a0] sm:mt-3 sm:text-[15px]">
                    Chúng tôi đã gửi mã xác minh 6 số tới <span className="font-medium text-[#51648f]">{maskedEmail}</span>
                  </p>
                </div>

                <div className="px-2 pb-5 sm:px-6 sm:pb-8">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={setOtp}
                      containerClassName="w-full justify-center gap-2 sm:gap-4"
                      className="justify-center"
                    >
                      <InputOTPGroup className="grid w-full grid-cols-6 gap-2 sm:flex sm:w-auto sm:gap-4">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot
                            key={index}
                            index={index}
                            className="h-16 w-full min-w-0 rounded-[14px] border border-[rgba(135,150,190,0.2)] bg-white text-2xl font-semibold text-[#151b2f] shadow-[0_8px_18px_rgba(120,146,220,0.08)] first:rounded-[14px] first:border last:rounded-[14px] sm:h-24 sm:w-[4.6rem] sm:rounded-[18px] sm:text-3xl sm:shadow-[0_10px_24px_rgba(120,146,220,0.08)] sm:first:rounded-[18px] sm:last:rounded-[18px]"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-mint/20 bg-mint/10 px-4 py-3 text-sm text-mint">
              {success}
              {process.env.NEXT_PUBLIC_OTP_DEBUG === "true" && otpPreview ? (
                <>
                  {" "}
                  OTP demo: <strong>{otpPreview}</strong>
                </>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-5 py-3 font-medium text-white ${isOtpStep
              ? otp.length === 6
                ? "rounded-2xl bg-[linear-gradient(180deg,#fb923c,#dd6b4d)] text-[15px] shadow-[0_18px_40px_rgba(221,107,77,0.30)] transition-all duration-300"
                : "rounded-2xl bg-[linear-gradient(180deg,#95afff,#84a0f5)] text-[15px] shadow-[0_18px_40px_rgba(120,146,220,0.22)] transition-all duration-300"
              : "rounded-full bg-[linear-gradient(135deg,#2a3142,#dd6b4d)]"
              } ${isSubmitting ? "cursor-not-allowed opacity-70" : ""}`}
          >
            {isSubmitting
              ? "Đang xử lý..."
              : mode === "login"
                ? loginStep === "form"
                  ? "Gửi OTP đăng nhập"
                  : "Xác minh OTP"
                : registerStep === "form"
                  ? "Gửi OTP"
                  : "Xác minh OTP"}
          </button>
        </form>

        {isOtpStep ? (
          <div className="mt-4 border-t border-[rgba(123,145,199,0.14)] px-0 pt-5 text-center text-sm text-[#7080a0] sm:mt-6 sm:px-8 sm:pt-8 sm:text-[15px]">
            Didn't receive the code?{" "}
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resendCountdown > 0 || isSubmitting}
              className="font-semibold text-[#3b6af5] disabled:cursor-not-allowed disabled:text-[#9aa7c7]"
            >
              {resendCountdown > 0 ? `Resend Code in ${resendCountdown}s` : "Resend Code"}
            </button>
          </div>
        ) : (
          <div className="mt-6 text-sm text-muted">
            {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
            <Link
              href={(mode === "login" ? "/register" : "/login") as Route}
              className="font-medium text-ink underline underline-offset-4"
            >
              {mode === "login" ? "Đăng ký ngay" : "Đăng nhập"}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
