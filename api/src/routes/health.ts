import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

router.get("/ping", (_req: Request, res: Response) => {
  res.json({ ok: true, ts: Date.now(), env: process.env.VERCEL ? "vercel" : "local" });
});

export default router;
