import { useEffect } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, GraduationCap, ShieldCheck } from "lucide-react";

const YEARS = Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i));

const formSchema = z.object({
  exam: z.enum(["ssc", "hsc", "jsc", "psc"] as const, { required_error: "Select exam type." }),
  year: z.string({ required_error: "Select year." }),
  board: z.enum([
    "dhaka", "rajshahi", "comilla", "jessore", "chittagong",
    "barisal", "sylhet", "dinajpur", "mymensingh", "madrasah", "technical",
  ] as const, { required_error: "Select board." }),
  roll: z.string().min(1, "Roll number is required.").regex(/^[0-9]+$/, "Numbers only."),
  reg: z.string().min(1, "Registration number is required.").regex(/^[0-9]+$/, "Numbers only."),
  captchaValue: z.string().min(1, "Enter the CAPTCHA answer."),
  sessionCookie: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: captchaData,
    isLoading: isLoadingCaptcha,
    isError: isCaptchaError,
    error: captchaError,
    refetch: refetchCaptcha,
  } = useQuery({
    queryKey: ["captcha"],
    queryFn: async () => {
      const res = await fetch("/api/results/captcha");
      const json = await res.json();
      if (!res.ok) throw json;
      return json as { imageData: string; sessionCookie: string };
    },
    retry: 2,
  });

  const checkResult = useMutation({
    mutationFn: async (body: Omit<FormValues, "sessionCookie"> & { sessionCookie: string }) => {
      const res = await fetch("/api/results/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      return data as { success: boolean; resultHtml: string };
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      exam: "ssc",
      year: new Date().getFullYear().toString(),
      board: "dhaka",
      roll: "",
      reg: "",
      captchaValue: "",
      sessionCookie: "",
    },
  });

  useEffect(() => {
    if (captchaData?.sessionCookie) {
      form.setValue("sessionCookie", captchaData.sessionCookie);
    }
  }, [captchaData, form]);

  const onSubmit = (values: FormValues) => {
    if (!values.sessionCookie) {
      toast({ title: "Session expired", description: "Please refresh the CAPTCHA.", variant: "destructive" });
      return;
    }
    checkResult.mutate(
      { ...values, sessionCookie: values.sessionCookie! },
      {
        onSuccess: (data) => {
          if (data.success) {
            sessionStorage.setItem("bd_result_html", data.resultHtml);
            setLocation("/result");
          }
        },
        onError: (error) => {
          toast({
            title: "Failed to fetch result",
            description: (error as { error?: string })?.error || "Something went wrong. Please try again.",
            variant: "destructive",
          });
          refetchCaptcha();
          form.setValue("captchaValue", "");
        },
      },
    );
  };

  const handleRefreshCaptcha = () => {
    queryClient.invalidateQueries({ queryKey: ["captcha"] });
    form.setValue("captchaValue", "");
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background">
      {/* Background decoration */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-8 max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-lg shadow-primary/30 mb-5">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-title">
            BD Education Results
          </h1>
          <p className="text-muted-foreground mt-2 text-sm" data-testid="text-subtitle">
            Check your Bangladesh Education Board exam result instantly.
          </p>
        </div>

        {/* Form Card */}
        <Card className="w-full max-w-lg shadow-2xl shadow-black/8 border-border/60">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent className="p-6 space-y-6">

                {/* Exam details */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Exam Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="exam"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Examination</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="input-exam" className="h-10">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="hsc">HSC / Alim</SelectItem>
                              <SelectItem value="ssc">SSC / Dakhil</SelectItem>
                              <SelectItem value="jsc">JSC / JDC</SelectItem>
                              <SelectItem value="psc">PSC / Ebtedayee</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Year</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="input-year" className="h-10">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {YEARS.map((y) => (
                                <SelectItem key={y} value={y}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Board */}
                <FormField
                  control={form.control}
                  name="board"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Education Board</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="input-board" className="h-10">
                            <SelectValue placeholder="Select board" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[
                            ["barisal", "Barisal"],
                            ["chittagong", "Chittagong"],
                            ["comilla", "Comilla"],
                            ["dhaka", "Dhaka"],
                            ["dinajpur", "Dinajpur"],
                            ["jessore", "Jessore"],
                            ["madrasah", "Madrasah"],
                            ["mymensingh", "Mymensingh"],
                            ["rajshahi", "Rajshahi"],
                            ["sylhet", "Sylhet"],
                            ["technical", "Technical"],
                          ].map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Roll & Registration */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Student Info</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="roll"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Roll Number</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 123456" {...field} data-testid="input-roll" className="h-10" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="reg"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Registration No.</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 1234567890" {...field} data-testid="input-reg" className="h-10" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* CAPTCHA */}
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Security Verification</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Captcha image box */}
                    <div className="relative flex-shrink-0 w-[140px] h-[52px] bg-white rounded-lg border border-border flex items-center justify-center overflow-hidden shadow-inner">
                      {isLoadingCaptcha ? (
                        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                      ) : isCaptchaError ? (
                        <span className="text-[10px] text-destructive text-center px-2 leading-tight">
                          {(captchaError as { error?: string })?.error || "Failed to load"}
                        </span>
                      ) : captchaData?.imageData ? (
                        <img src={captchaData.imageData} alt="CAPTCHA" className="h-[42px] object-contain mix-blend-multiply" />
                      ) : null}
                    </div>

                    {/* Refresh */}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleRefreshCaptcha}
                      disabled={isLoadingCaptcha}
                      title="Refresh CAPTCHA"
                      data-testid="button-refresh-captcha"
                      className="flex-shrink-0 h-9 w-9"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCaptcha ? "animate-spin" : ""}`} />
                    </Button>

                    {/* Answer input */}
                    <FormField
                      control={form.control}
                      name="captchaValue"
                      render={({ field }) => (
                        <FormItem className="flex-1 min-w-0">
                          <FormControl>
                            <Input
                              placeholder="Enter answer"
                              {...field}
                              data-testid="input-captcha"
                              className="h-10 bg-background"
                              inputMode="numeric"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold shadow-md shadow-primary/20"
                  disabled={checkResult.isPending || isLoadingCaptcha}
                  data-testid="button-submit"
                >
                  {checkResult.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Fetching Result…
                    </>
                  ) : (
                    "Check Result"
                  )}
                </Button>
              </CardContent>
            </form>
          </Form>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Not affiliated with the Bangladesh Education Board.{" "}
          Developed by{" "}
          <a href="https://neoaz.is-a.dev" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
            neoaz
          </a>
        </p>
      </div>
    </div>
  );
}
