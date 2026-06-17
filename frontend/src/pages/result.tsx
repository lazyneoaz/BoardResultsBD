import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download, Loader2, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Result() {
  const [, setLocation] = useLocation();
  const [isDownloading, setIsDownloading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const resultHtml =
    typeof window !== "undefined" ? sessionStorage.getItem("bd_result_html") : null;

  useEffect(() => {
    if (!resultHtml) setLocation("/");
  }, [resultHtml, setLocation]);

  if (!resultHtml) return null;

  const handleDownloadPdf = async () => {
    if (!contentRef.current) return;
    setIsDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        removeContainer: true,
        onclone: (_doc: Document, el: HTMLElement) => {
          el.style.borderRadius = "0";
          el.style.boxShadow = "none";
        },
      });

      const A4_W = 210; // mm
      const A4_H = 297; // mm
      const imgW = A4_W;
      const imgH = (canvas.height * imgW) / canvas.width;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      // Place image across pages: shift image upward by pageHeight on each new page
      let heightLeft = imgH;
      let pageTop = 0;

      pdf.addImage(imgData, "JPEG", 0, 0, imgW, imgH);
      heightLeft -= A4_H;

      while (heightLeft > 0) {
        pageTop -= A4_H;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, pageTop, imgW, imgH);
        heightLeft -= A4_H;
      }

      pdf.save("bd-exam-result.pdf");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast({
        title: "PDF download failed",
        description: "Use the Print button and choose 'Save as PDF' instead.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 print:hidden">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
              className="shrink-0 -ml-1"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-semibold text-base truncate">Exam Result</h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              data-testid="button-download-pdf"
              className="gap-1.5"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {isDownloading ? "Generating…" : "Download PDF"}
              </span>
              <span className="sm:hidden text-xs">PDF</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
              data-testid="button-print"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sessionStorage.removeItem("bd_result_html");
                setLocation("/");
              }}
              data-testid="button-check-another"
            >
              <span className="hidden sm:inline">Check Another</span>
              <span className="sm:hidden text-xs">New</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 pb-12">
        <div
          ref={contentRef}
          className="bg-white rounded-xl border border-border/60 shadow-md overflow-hidden print:shadow-none print:border-none print:rounded-none"
        >
          {/* Document header — captured in PDF */}
          <div className="bg-primary px-6 py-5 flex items-center gap-4 print:py-4">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base leading-tight">
                Bangladesh Education Board
              </h2>
              <p className="text-white/75 text-xs mt-0.5">Official Examination Result</p>
            </div>
          </div>

          {/* Result HTML */}
          <div
            className="p-5 sm:p-6 overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: resultHtml }}
            data-testid="content-result-html"
          />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground print:hidden">
          Not affiliated with the Bangladesh Education Board.
        </p>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; }
          header { display: none !important; }
          main { padding: 0 !important; max-width: 100% !important; }
        }
        [data-testid="content-result-html"] table {
          max-width: 100%;
          word-break: break-word;
        }
        [data-testid="content-result-html"] td,
        [data-testid="content-result-html"] th {
          max-width: 200px;
          overflow-wrap: break-word;
        }
      `}} />
    </div>
  );
}
