import { useEffect, useMemo, useState } from "react";
import { Box, Button, CircularProgress, Dialog, IconButton, Typography } from "@mui/material";
import { X as CloseIcon, ExternalLink as OpenInNewIcon } from "../ui/Icons";
import { radius } from "../../theme/surfaces";
import { filePreviewKind, filePreviewType } from "../../utils/filePreview";

export interface FilePreviewRequest {
  fileName: string;
  /** Fetches the file. Public reviewers go through the server; signed-in staff straight to SharePoint. */
  load: () => Promise<Blob>;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; blob: Blob }
  | { status: "failed"; message: string };

/**
 * A Word document drawn into a page that cannot run anything.
 *
 * The document is laid out off-screen, then shown inside a frame with every
 * sandbox permission withheld, so nothing in the file — a link, an embedded
 * object — can reach this site or open a window.
 */
function WordPreview({ blob, title }: { blob: Blob; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        const container = document.createElement("div");
        await renderAsync(blob, container, undefined, { inWrapper: true, useBase64URL: true, ignoreLastRenderedPageBreak: true });
        if (!cancelled) {
          setHtml(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${container.innerHTML}</body></html>`);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [blob]);

  if (failed) return <PreviewMessage text="This document could not be shown here. Use Download to open it." />;
  if (html === null) return <PreviewLoading />;
  return (
    <Box
      component="iframe"
      title={title}
      sandbox=""
      srcDoc={html}
      sx={{ width: "100%", height: "100%", border: 0, display: "block", bgcolor: "#fff" }}
    />
  );
}

function PreviewLoading() {
  return (
    <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}>
      <CircularProgress size={28} aria-label="Loading file" />
    </Box>
  );
}

function PreviewMessage({ text }: { text: string }) {
  return (
    <Box sx={{ height: "100%", display: "grid", placeItems: "center", p: 3 }}>
      <Typography sx={{ maxWidth: 420, textAlign: "center", color: "text.secondary", fontSize: 15 }}>{text}</Typography>
    </Box>
  );
}

/**
 * Shows an attached file in the page instead of sending the reader to
 * SharePoint, which a public reviewer cannot open. Pictures, PDFs and Word
 * documents are drawn here; anything else is offered as a download.
 */
export default function FilePreviewDialog({ request, onClose }: { request: FilePreviewRequest | null; onClose: () => void }) {
  // Each result remembers which request it answers, so opening another file
  // shows "loading" straight away rather than the previous file.
  const [result, setResult] = useState<{ request: FilePreviewRequest; state: LoadState } | null>(null);
  const state: LoadState = request && result?.request === request ? result.state : { status: "loading" };
  const kind = request ? filePreviewKind(request.fileName) : "none";

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    request.load()
      .then((raw) => {
        // Re-typed from the name: the bytes are only ever treated as what the
        // name says, never as whatever the server or file claims to be.
        if (!cancelled) setResult({ request, state: { status: "ready", blob: new Blob([raw], { type: filePreviewType(request.fileName) }) } });
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ request, state: { status: "failed", message: error instanceof Error && error.message ? error.message : "This file could not be loaded." } });
      });
    return () => { cancelled = true; };
  }, [request]);

  const blob = state.status === "ready" ? state.blob : null;
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : ""), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const download = () => {
    if (!url || !request) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = request.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const title = request ? `Preview of ${request.fileName}` : "File preview";

  let body;
  if (state.status === "loading") body = <PreviewLoading />;
  else if (state.status === "failed") body = <PreviewMessage text={state.message} />;
  else if (kind === "image") body = (
    <Box sx={{ height: "100%", overflow: "auto", display: "grid", placeItems: "center", p: 2 }}>
      <Box component="img" src={url} alt={request?.fileName ?? ""} sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </Box>
  );
  else if (kind === "pdf") body = <Box component="iframe" title={title} src={url} sx={{ width: "100%", height: "100%", border: 0, display: "block" }} />;
  else if (kind === "word" && blob) body = <WordPreview blob={blob} title={title} />;
  else body = <PreviewMessage text="This kind of file can't be shown here. Use Download to open it." />;

  return (
    <Dialog
      open={Boolean(request)}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-labelledby="file-preview-title"
      slotProps={{ paper: { sx: { height: { xs: "100%", sm: "90vh" }, m: { xs: 0, sm: 4 }, maxHeight: { xs: "100%", sm: "90vh" }, borderRadius: { xs: 0, sm: radius.lg }, display: "flex", flexDirection: "column" } } }}
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1, px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Typography id="file-preview-title" sx={{ flex: "1 1 200px", minWidth: 0, fontSize: 15, fontWeight: 700 }} noWrap>
          {request?.fileName ?? "File"}
        </Typography>
        {kind === "pdf" && url && (
          // Most phones will not draw a PDF inside the page.
          <Button component="a" href={url} target="_blank" rel="noopener noreferrer" variant="outlined" startIcon={<OpenInNewIcon size={16} />} sx={{ height: 40, borderRadius: radius.xs, textTransform: "none", fontWeight: 600 }}>
            Open in a new tab
          </Button>
        )}
        <Button variant="contained" disabled={!url} onClick={download} sx={{ height: 40, borderRadius: radius.xs, textTransform: "none", fontWeight: 700 }}>
          Download
        </Button>
        <IconButton aria-label="Close preview" onClick={onClose} sx={{ width: 40, height: 40, borderRadius: radius.xs }}>
          <CloseIcon size={18} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, bgcolor: "background.default" }}>{body}</Box>
    </Dialog>
  );
}
