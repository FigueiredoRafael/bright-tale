"use client";

import StartWorkflowButton from "@/components/projects/StartWorkflowButton";
import { Zap } from "lucide-react";

const STEPS = [
  { num: "1", color: "#A78BFA", title: "Brainstorm Ideas", desc: "Generate content ideas with AI assistance and pick the best ones." },
  { num: "2", color: "#60A5FA", title: "Research & Produce", desc: "Deep-dive into your topic, then create blog, video, shorts & podcast content." },
  { num: "3", color: "#4ADE80", title: "Review & Publish", desc: "Quality check with AI review, then publish directly to WordPress." },
];

export default function EmptyState() {
  return (
    <>
      <div className="bg-card border border-border rounded-[14px] py-16 px-10 text-center relative overflow-hidden">
        <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[400px] h-[160px] bg-[radial-gradient(ellipse,rgba(45,212,168,0.05),transparent)] pointer-events-none" />
        <div className="relative">
          <div className="w-16 h-16 rounded-[20px] bg-primary/[0.08] border border-primary/[0.12] mx-auto mb-5 flex items-center justify-center">
            <Zap className="h-7 w-7 text-primary" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-xl font-bold mb-2">Welcome to Bright Curios</h2>
          <p className="text-muted-foreground text-sm max-w-[400px] mx-auto mb-6 leading-relaxed">
            Your AI-powered content workflow starts here. Create your first project to brainstorm, research, produce, and publish content across all formats.
          </p>
          <StartWorkflowButton className="bg-gradient-to-br from-[#FF6B35] to-[#E85D2C] text-white text-sm font-semibold px-7 py-3 rounded-[10px] shadow-[0_4px_16px_rgba(255,107,53,0.25)] hover:shadow-[0_6px_24px_rgba(255,107,53,0.4)] hover:-translate-y-0.5" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        {STEPS.map((step) => (
          <div key={step.num} className="bg-card border border-border rounded-[14px] p-6 text-center hover:border-primary/15 transition-colors">
            <div
              className="w-7 h-7 rounded-lg mx-auto mb-3 flex items-center justify-center font-display text-[13px] font-bold"
              style={{ background: `${step.color}1F`, color: step.color }}
            >
              {step.num}
            </div>
            <div className="text-[13px] font-semibold mb-1">{step.title}</div>
            <div className="text-muted-foreground text-xs leading-relaxed">{step.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}
