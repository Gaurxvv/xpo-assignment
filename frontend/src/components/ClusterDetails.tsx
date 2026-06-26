"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Calendar, BookOpen, AlertTriangle, X } from "lucide-react";

interface Article {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  url: string;
  source: string;
  publishedAt: string;
  createdAt: string;
}

interface ClusterDetail {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  articleCount: number;
  articles: Article[];
}

interface ClusterDetailsProps {
  clusterId?: string;
  onClose: () => void;
}

export default function ClusterDetails({ clusterId, onClose }: ClusterDetailsProps) {
  // Query to fetch specific cluster details
  const { data: cluster, isLoading, error } = useQuery<ClusterDetail>({
    queryKey: ["cluster", clusterId],
    queryFn: async () => {
      if (!clusterId) throw new Error("No cluster ID selected");
      const res = await fetch(`http://localhost:3001/clusters/${clusterId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch cluster details");
      }
      return res.json();
    },
    enabled: !!clusterId,
  });

  if (!clusterId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center bg-white/20 dark:bg-slate-900/20 rounded-2xl border border-slate-200/40 dark:border-slate-800/40 backdrop-blur-sm">
        <BookOpen className="w-10 h-10 mb-3 opacity-60 text-slate-400" />
        <p className="font-semibold text-base mb-1">No Cluster Selected</p>
        <p className="text-sm opacity-80">Click on any block in the timeline above to view related articles and coverage details.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-8 w-2/3 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
        <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
        <div className="space-y-3 pt-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="border border-slate-100 dark:border-slate-850 p-4 rounded-xl space-y-3 bg-white/50 dark:bg-slate-900/50">
              <div className="h-5 w-5/6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-3 w-1/4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !cluster) {
    return (
      <div className="p-8 border border-red-200/50 dark:border-red-900/30 bg-red-500/5 dark:bg-red-500/2 rounded-2xl text-red-500 dark:text-red-400 flex flex-col items-center justify-center text-center">
        <AlertTriangle className="w-10 h-10 mb-3" />
        <p className="font-bold">Error Loading Details</p>
        <p className="text-xs mt-1 opacity-80">{error?.message || "Failed to load articles."}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-6 space-y-6 bg-white dark:bg-slate-900">
      {/* Header Info */}
      <div className="border-b border-[#E5E7EB] dark:border-slate-800 pb-5">
        <div className="flex justify-between items-start gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#6D5EF6] bg-[#6D5EF6]/10 px-2.5 py-0.5 rounded-full mb-3 inline-block">
              Cluster Details
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
              {cluster.label}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            title="Close details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 text-[13px] font-medium text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 opacity-70" />
            {cluster.articleCount} Articles
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 opacity-70" />
            {new Date(cluster.startTime).toLocaleDateString([], { month: "short", day: "numeric" })} – {new Date(cluster.endTime).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>

      {/* Chronological Article List */}
      <div className="space-y-5">
        <h3 className="text-[11px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-2">
          Source Articles
        </h3>
        
        <div className="relative border-l-2 border-[#E5E7EB] dark:border-slate-800 pl-5 ml-2.5 space-y-6">
          {cluster.articles.map((article) => (
            <div key={article.id} className="relative group">
              {/* Bullet node on the timeline line */}
              <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full border-[3px] border-white dark:border-slate-900 bg-[#6D5EF6] ring-1 ring-[#E5E7EB] dark:ring-slate-700 transition-transform group-hover:scale-125 group-hover:ring-[#6D5EF6]/30" />

              <div className="bg-white dark:bg-slate-900/60 border border-[#E5E7EB] dark:border-slate-800 rounded-[12px] p-4 shadow-sm hover:shadow-[0_4px_12px_-4px_rgb(0,0,0,0.08)] transition-all hover:-translate-y-0.5">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full inline-block mb-2.5">
                      {article.source}
                    </span>
                    <h4 className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug group-hover:text-[#6D5EF6] transition-colors line-clamp-2">
                      {article.title}
                    </h4>
                  </div>
                  
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-md border border-transparent hover:border-[#E5E7EB] dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex-shrink-0"
                    title="Read original source"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                {article.summary && (
                  <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-2.5 leading-relaxed line-clamp-3">
                    {article.summary}
                  </p>
                )}

                <div className="text-[11px] font-medium text-slate-400 mt-4 flex justify-between items-center pt-3 border-t border-[#E5E7EB] dark:border-slate-800/50">
                  <span>
                    {new Date(article.publishedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                  </span>
                  {article.content && (
                    <span className="text-[#10B981]">
                      Full Text Available
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
