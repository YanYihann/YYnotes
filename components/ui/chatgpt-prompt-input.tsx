"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { AIModelSelector, type AIModelOption } from "@/components/ui/animated-ai-input";

type PromptAttachmentSource = "file" | "voice";

export type PromptAttachment = {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  source: PromptAttachmentSource;
  previewUrl?: string;
};

export type PromptSubmitPayload = {
  text: string;
  attachments: PromptAttachment[];
};

type PromptBoxProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "defaultValue" | "onChange" | "onSubmit"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onSubmitPrompt: (payload: PromptSubmitPayload) => Promise<boolean | void> | boolean | void;
  disabled?: boolean;
  className?: string;
  textareaStyle?: React.CSSProperties;
  modelOptions?: AIModelOption[];
  selectedModel?: string;
  onSelectedModelChange?: (modelId: string) => void;
};

interface WebSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface WebSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: WebSpeechRecognitionAlternative;
}

interface WebSpeechRecognitionResultList {
  length: number;
  [index: number]: WebSpeechRecognitionResult;
}

interface WebSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: WebSpeechRecognitionResultList;
}

interface WebSpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface WebSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: WebSpeechRecognition, ev: Event) => unknown) | null;
  onresult: ((this: WebSpeechRecognition, ev: WebSpeechRecognitionEvent) => unknown) | null;
  onerror: ((this: WebSpeechRecognition, ev: WebSpeechRecognitionErrorEvent) => unknown) | null;
  onend: ((this: WebSpeechRecognition, ev: Event) => unknown) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type WebSpeechRecognitionConstructor = new () => WebSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: WebSpeechRecognitionConstructor;
    webkitSpeechRecognition?: WebSpeechRecognitionConstructor;
  }
}

type ClassValue = string | number | boolean | null | undefined;

function classMerge(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size}B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)}KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function buildAttachment(file: File, source: PromptAttachmentSource): PromptAttachment {
  const isImage = file.type.startsWith("image/");
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    source,
    previewUrl: isImage ? URL.createObjectURL(file) : undefined,
  };
}

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { showArrow?: boolean }
>(({ className, sideOffset = 4, showArrow = false, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={classMerge(
        "relative z-50 max-w-[280px] rounded-md bg-popover px-1.5 py-1 text-xs text-popover-foreground",
        "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    >
      {props.children}
      {showArrow ? <TooltipPrimitive.Arrow className="-my-px fill-popover" /> : null}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={classMerge(
        "z-50 w-64 rounded-xl bg-popover p-2 text-popover-foreground shadow-md outline-none",
        "animate-in data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "bg-popover text-popover-foreground",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={classMerge(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={classMerge(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-[90vw] translate-x-[-50%] translate-y-[-50%]",
        "gap-4 border-none bg-transparent p-0 shadow-none duration-300",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    >
      <div className="relative overflow-hidden rounded-[20px] bg-popover p-2 shadow-2xl">
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 z-10 rounded-full bg-card/80 p-1 transition-all hover:bg-accent">
          <XIcon className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </div>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M12 5V19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 12H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Settings2Icon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 7h-9" />
    <path d="M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </svg>
);

const SendIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M12 5.25L12 18.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.75 12L12 5.25L5.25 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const MicIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
  </svg>
);

const FileIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const toolsList = [
  { id: "quick-summary", name: "Summarize this note", shortName: "Summary" },
  { id: "formula-check", name: "Check formulas", shortName: "Formula" },
  { id: "step-derive", name: "Derive by steps", shortName: "Derive" },
];

export const PromptBox = React.forwardRef<HTMLTextAreaElement, PromptBoxProps>(
  (
    {
      className,
      value,
      onValueChange,
      onSubmitPrompt,
      disabled = false,
      placeholder = "Message...",
      textareaStyle,
      modelOptions,
      selectedModel,
      onSelectedModelChange,
      ...props
    },
    ref,
  ) => {
    const internalTextareaRef = React.useRef<HTMLTextAreaElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const speechRecognitionRef = React.useRef<WebSpeechRecognition | null>(null);
    const speechBaseRef = React.useRef("");
    const speechCommittedRef = React.useRef("");
    const attachmentsRef = React.useRef<PromptAttachment[]>([]);
    const [attachments, setAttachments] = React.useState<PromptAttachment[]>([]);
    const [selectedTool, setSelectedTool] = React.useState<string | null>(null);
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
    const [previewAttachmentId, setPreviewAttachmentId] = React.useState<string | null>(null);
    const [isListening, setIsListening] = React.useState(false);
    const [speechError, setSpeechError] = React.useState<string>("");

    React.useImperativeHandle(ref, () => internalTextareaRef.current!, []);

    React.useLayoutEffect(() => {
      const textarea = internalTextareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.style.height = "auto";
      const nextHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${nextHeight}px`;
    }, [value]);

    React.useEffect(() => {
      attachmentsRef.current = attachments;
    }, [attachments]);

    React.useEffect(() => {
      return () => {
        attachmentsRef.current.forEach((item) => {
          if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
        });
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.onstart = null;
          speechRecognitionRef.current.onresult = null;
          speechRecognitionRef.current.onerror = null;
          speechRecognitionRef.current.onend = null;
          speechRecognitionRef.current.abort();
          speechRecognitionRef.current = null;
        }
      };
    }, []);

    const activeTool = selectedTool ? toolsList.find((tool) => tool.id === selectedTool) ?? null : null;
    const hasValue = value.trim().length > 0 || attachments.length > 0;
    const previewAttachment = attachments.find((item) => item.id === previewAttachmentId) ?? null;

    const setFiles = React.useCallback((files: FileList | null, source: PromptAttachmentSource = "file") => {
      if (!files || files.length === 0) {
        return;
      }
      const incoming = Array.from(files).map((file) => {
        const actualSource: PromptAttachmentSource = file.type.startsWith("audio/") ? "voice" : source;
        return buildAttachment(file, actualSource);
      });
      setAttachments((current) => [...current, ...incoming]);
    }, []);

    const removeAttachment = React.useCallback((attachmentId: string) => {
      setAttachments((current) => {
        const target = current.find((item) => item.id === attachmentId);
        if (target?.previewUrl) {
          URL.revokeObjectURL(target.previewUrl);
        }
        return current.filter((item) => item.id !== attachmentId);
      });
      if (previewAttachmentId === attachmentId) {
        setPreviewAttachmentId(null);
        setIsPreviewOpen(false);
      }
    }, [previewAttachmentId]);

    const getSpeechRecognitionCtor = React.useCallback((): WebSpeechRecognitionConstructor | null => {
      if (typeof window === "undefined") {
        return null;
      }
      return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
    }, []);

    const stopListening = React.useCallback(() => {
      const recognition = speechRecognitionRef.current;
      if (!recognition) {
        return;
      }
      recognition.stop();
    }, []);

    const startListening = React.useCallback(() => {
      const SpeechRecognitionCtor = getSpeechRecognitionCtor();
      if (!SpeechRecognitionCtor) {
        setSpeechError("This browser does not support speech recognition. Please use the latest Chrome or Edge.");
        return;
      }

      setSpeechError("");

      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onstart = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.abort();
        speechRecognitionRef.current = null;
      }

      const recognition = new SpeechRecognitionCtor();
      speechRecognitionRef.current = recognition;
      speechBaseRef.current = value;
      speechCommittedRef.current = "";

      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript?.trim() ?? "";
          if (!transcript) {
            continue;
          }
          if (result.isFinal) {
            speechCommittedRef.current = `${speechCommittedRef.current}${speechCommittedRef.current ? " " : ""}${transcript}`;
          } else {
            interimText = `${interimText}${interimText ? " " : ""}${transcript}`;
          }
        }

        const baseText = speechBaseRef.current.trimEnd();
        const spokenText = `${speechCommittedRef.current}${interimText ? ` ${interimText}` : ""}`.trim();
        const separator = baseText && spokenText ? "\n" : "";
        onValueChange(`${baseText}${separator}${spokenText}`);
      };

      recognition.onerror = (event) => {
        const key = (event.error || "").toLowerCase();
        if (key === "not-allowed" || key === "service-not-allowed") {
          setSpeechError("Microphone access was denied. Please allow microphone permission in your browser.");
          return;
        }
        if (key === "no-speech") {
          setSpeechError("No speech detected. Please try again.");
          return;
        }
        if (key === "audio-capture") {
          setSpeechError("No available microphone was detected.");
          return;
        }
        setSpeechError("Speech recognition failed. Please try again.");
      };

      recognition.onend = () => {
        setIsListening(false);
        speechRecognitionRef.current = null;
      };

      recognition.start();
    }, [getSpeechRecognitionCtor, onValueChange, value]);

    const handleMicClick = React.useCallback(() => {
      if (disabled) {
        return;
      }
      if (isListening) {
        stopListening();
        return;
      }
      startListening();
    }, [disabled, isListening, startListening, stopListening]);

    const clearAllAttachments = React.useCallback(() => {
      setAttachments((current) => {
        current.forEach((item) => {
          if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
        });
        return [];
      });
      setPreviewAttachmentId(null);
      setIsPreviewOpen(false);
    }, []);

    const submitPrompt = React.useCallback(async () => {
      if (!hasValue || disabled) {
        return;
      }
      try {
        const shouldClear = await onSubmitPrompt({
          text: value.trim(),
          attachments,
        });
        if (shouldClear !== false) {
          onValueChange("");
          clearAllAttachments();
        }
      } catch {
        // Keep user input and attachments for retry when upstream submission fails.
      }
    }, [attachments, clearAllAttachments, disabled, hasValue, onSubmitPrompt, onValueChange, value]);

    const onKeyDown = React.useCallback(
      async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== "Enter" || event.shiftKey) {
          return;
        }
        event.preventDefault();
        await submitPrompt();
      },
      [submitPrompt],
    );

    return (
      <div
        className={cn(
          "flex flex-col rounded-[22px] border border-input bg-card p-2 shadow-sm transition-colors",
          "",
          className,
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event) => {
            setFiles(event.target.files, "file");
            event.currentTarget.value = "";
          }}
          accept="image/*,.pdf,.txt,.md,.json,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.rar,.7z,audio/*"
        />

        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-capsule border px-2 py-1 text-[11px]",
                  "border-border bg-muted text-muted-foreground",
                )}
              >
                {attachment.previewUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewAttachmentId(attachment.id);
                      setIsPreviewOpen(true);
                    }}
                    className="shrink-0"
                    title="Preview image"
                  >
                    <img src={attachment.previewUrl} alt={attachment.name} className="h-7 w-7 rounded-md object-cover" />
                  </button>
                ) : (
                  <FileIcon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="max-w-[170px] truncate">{attachment.name}</span>
                <span className="text-muted-foreground">{formatBytes(attachment.size)}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="rounded-full p-[1px] transition hover:bg-accent"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {speechError ? (
          <p className="mb-1 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-2 py-1 text-[11px] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
            {speechError}
          </p>
        ) : null}

        <textarea
          ref={(node) => {
            internalTextareaRef.current = node;
            if (typeof ref === "function") {
              ref(node);
              return;
            }
            if (ref) {
              ref.current = node;
            }
          }}
          rows={1}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="min-h-12 w-full resize-none border-0 bg-transparent p-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          style={textareaStyle}
          {...props}
        />

        <div className="p-1 pt-0">
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none"
                    disabled={disabled}
                  >
                    <PlusIcon className="h-6 w-6" />
                    <span className="sr-only">Attach file</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" showArrow>
                  <p>Attach files</p>
                </TooltipContent>
              </Tooltip>

              {modelOptions?.length && selectedModel && onSelectedModelChange ? (
                <>
                  <AIModelSelector
                    models={modelOptions}
                    value={selectedModel}
                    onValueChange={onSelectedModelChange}
                    disabled={disabled}
                    triggerClassName="h-8 rounded-full px-2 text-[12px] text-foreground dark:text-foreground"
                    contentClassName="font-text"
                  />
                  <div className="h-4 w-px bg-black/15 dark:bg-gray-600" />
                </>
              ) : null}

              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 items-center gap-1 rounded-full p-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none"
                      >
                        <Settings2Icon className="h-4 w-4" />
                        {!selectedTool ? "Tools" : null}
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow>
                    <p>Quick tools</p>
                  </TooltipContent>
                </Tooltip>
                <PopoverContent side="top" align="start">
                  <div className="flex flex-col gap-1">
                    {toolsList.map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => {
                          setSelectedTool(tool.id);
                          setIsPopoverOpen(false);
                        }}
                        className="w-full rounded-md p-2 text-left text-sm transition hover:bg-accent"
                      >
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {activeTool ? (
                <>
                  <div className="h-4 w-px bg-black/15 dark:bg-gray-600" />
                  <button
                    onClick={() => setSelectedTool(null)}
                    className="flex h-8 items-center gap-1 rounded-full px-2 text-sm text-primary transition-colors hover:bg-accent"
                    type="button"
                  >
                    {activeTool.shortName}
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleMicClick}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none",
                        "",
                        isListening ? "text-[#b4232f] dark:text-[#ff7f89]" : "",
                      )}
                      disabled={disabled}
                    >
                      <MicIcon className="h-5 w-5" />
                      <span className="sr-only">Voice input</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow>
                    <p>{isListening ? "Stop voice input" : "Start voice input"}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled || !hasValue}
                      onClick={submitPrompt}
                    className="btn-apple-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
                  >
                      <SendIcon className="h-5 w-5" />
                      <span className="sr-only">Send message</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow>
                    <p>Send</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TooltipProvider>
        </div>

        {previewAttachment ? (
          <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogContent>
              {previewAttachment.previewUrl ? (
                <img
                  src={previewAttachment.previewUrl}
                  alt={previewAttachment.name}
                  className="max-h-[90vh] w-full rounded-[16px] object-contain"
                />
              ) : null}
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    );
  },
);

PromptBox.displayName = "PromptBox";
