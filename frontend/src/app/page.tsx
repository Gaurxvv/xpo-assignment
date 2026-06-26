"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  RefreshCw, 
  Search, 
  Sun, 
  Moon, 
  Filter, 
  TrendingUp, 
  CheckCircle2, 
  Loader2, 
  AlertTriangle, 
  Database,
  Globe,
  Clock,
  ArrowUpRight,
  ArrowDownAZ
} from "lucide-react";
import { useTheme } from "@/components/ThemeContext";
import Timeline from "@/components/Timeline";
import ClusterDetails from "@/components/ClusterDetails";
import { API_BASE_URL } from "@/lib/api";

interface ClusterSummary {
  id: string;
  label: string;
  articleCount: number;
  startTime: string;
  endTime: string;
  sources: string[];
}

interface IngestJobStatus {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  message: string | null;
}

export default function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();

  // Dashboard Filters & State
  const [timeWindowDays, setTimeWindowDays] = useState<number>(30);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedClusterId, setSelectedClusterId] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<string>("newest");
  
  // Ingest Job Tracking State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgressMsg, setJobProgressMsg] = useState<string>("Initializing...");

  // 1. Fetch Clusters (Auto-refresh every 15 seconds)
  const { data: clusters = [], isLoading: isClustersLoading, error: clustersError } = useQuery<ClusterSummary[]>({
    queryKey: ["clusters"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/clusters`);
      if (!res.ok) throw new Error("Failed to fetch clusters");
      return res.json();
    },
    refetchInterval: activeJobId ? false : 15000,
  });

  // 2. Ingest Trigger Mutation
  const triggerIngestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/ingest/trigger`, {
        method: "POST",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to trigger ingestion");
      }
      return res.json(); // returns { jobId }
    },
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      setJobProgressMsg("Spawning scraper pipeline...");
    },
    onError: (err: Error) => {
      alert(err.message || "Failed to trigger ingestion");
    }
  });

  // 3. Poll Job Status
  const { data: jobStatus } = useQuery<IngestJobStatus>({
    queryKey: ["ingestJob", activeJobId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/ingest/status/${activeJobId}`);
      if (!res.ok) throw new Error("Failed to fetch job status");
      return res.json();
    },
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      // Poll every 2 seconds if job is pending or running
      const state = query.state.data;
      if (state && (state.status === "completed" || state.status === "failed")) {
        return false;
      }
      return 2000;
    },
  });

  // Effect to monitor polled job status transitions
  useEffect(() => {
    if (jobStatus) {
      if (jobStatus.message) {
        setJobProgressMsg(jobStatus.message);
      }
      
      if (jobStatus.status === "completed") {
        // Refresh dashboard data
        queryClient.invalidateQueries({ queryKey: ["clusters"] });
        // Clear active job after 4 seconds
        const timer = setTimeout(() => {
          setActiveJobId(null);
        }, 4000);
        return () => clearTimeout(timer);
      } else if (jobStatus.status === "failed") {
        const timer = setTimeout(() => {
          setActiveJobId(null);
        }, 6000);
        return () => clearTimeout(timer);
      }
    }
  }, [jobStatus, queryClient]);

  // Compute overall summary metrics
  const totalArticles = useMemo(() => {
    return clusters.reduce((acc, c) => acc + c.articleCount, 0);
  }, [clusters]);

  // Get list of all unique sources across clusters for the filter dropdown
  // For a basic implementation, we can just list the default sources
  const sourcesList = ["BBC News", "NPR News", "TechCrunch", "The Verge", "Wired"];

  // Filter clusters for timeline visualization
  const filteredTimelineData = useMemo(() => {
    // 1. Time range cutoff
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeWindowDays);

    return clusters
      .filter((c) => {
        const clusterStart = new Date(c.startTime);
        const matchesWindow = clusterStart >= cutoff;
        
        // Simple search query match
        const matchesSearch = searchQuery === "" || 
          c.label.toLowerCase().includes(searchQuery.toLowerCase());
          
        // Source filter match
        const matchesSource = selectedSource === "all" || 
          c.sources.includes(selectedSource);
          
        return matchesWindow && matchesSearch && matchesSource;
      })
      .map((c) => ({
        id: c.id,
        label: c.label,
        start: c.startTime,
        end: c.endTime,
        articleCount: c.articleCount
      }));
  }, [clusters, timeWindowDays, searchQuery, selectedSource]);

  // Compute Last Ingestion/Updated Time
  const lastUpdatedTime = useMemo(() => {
    if (!clusters || clusters.length === 0) return null;
    
    // Find the latest endTime among all clusters
    let latest = new Date(0);
    clusters.forEach(c => {
      const end = new Date(c.endTime);
      if (end > latest) latest = end;
    });
    
    return latest;
  }, [clusters]);

  // Format strings for display
  const lastUpdatedText = useMemo(() => {
    if (!lastUpdatedTime) return "Last updated: Never";
    
    const now = new Date();
    const diffMs = now.getTime() - lastUpdatedTime.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
    
    if (diffMins < 1) return "Last updated: Just now";
    if (diffMins < 60) return `Last updated: ${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Last updated: ${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Last updated: ${diffDays} days ago`;
  }, [lastUpdatedTime]);

  const lastIngestionTimeText = useMemo(() => {
    if (!lastUpdatedTime) return { time: "--:--", context: "" };
    
    const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    const timeStr = lastUpdatedTime.toLocaleTimeString([], timeOpts);
    
    const now = new Date();
    const isToday = lastUpdatedTime.getDate() === now.getDate() && 
                    lastUpdatedTime.getMonth() === now.getMonth() && 
                    lastUpdatedTime.getFullYear() === now.getFullYear();
                    
    return {
      time: timeStr,
      context: isToday ? "Today" : lastUpdatedTime.toLocaleDateString([], { month: 'short', day: 'numeric' })
    };
  }, [lastUpdatedTime]);

  return (
    <div className="min-h-screen pb-16 bg-[#F8FAFC] dark:bg-[#020617] text-slate-800 dark:text-slate-200 selection:bg-[#6D5EF6]/20">
      {/* Premium Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-[#E5E7EB] bg-white/80 dark:border-slate-800 dark:bg-slate-950/80 backdrop-blur-xl transition-all">
        <div className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#6D5EF6] flex items-center justify-center text-white shadow-sm shadow-[#6D5EF6]/20">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h1 className="text-[17px] font-bold tracking-tight text-slate-900 dark:text-white">
                News Pulse
              </h1>
            </div>
            
            {/* Last Updated Timestamp */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {lastUpdatedText}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              title="Toggle theme"
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {/* Ingestion Refresh Button */}
            <button
              onClick={() => triggerIngestMutation.mutate()}
              disabled={!!activeJobId || triggerIngestMutation.isPending}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeJobId 
                  ? "bg-slate-100 dark:bg-slate-900 text-slate-400 border border-[#E5E7EB] dark:border-slate-800 cursor-not-allowed"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-[#E5E7EB] dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
              }`}
            >
              {triggerIngestMutation.isPending || activeJobId ? (
                <Loader2 className="w-4 h-4 text-[#6D5EF6] animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 text-[#6D5EF6]" />
              )}
              {activeJobId ? "Syncing..." : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* Active Job Progress Banner */}
        {activeJobId && (
          <div className={`p-4 rounded-2xl border flex items-start md:items-center gap-3.5 shadow-sm transition-all duration-300 ${
            jobStatus?.status === "completed"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : jobStatus?.status === "failed"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
              : "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400"
          }`}>
            <div className="flex-shrink-0">
              {jobStatus?.status === "completed" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : jobStatus?.status === "failed" ? (
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              ) : (
                <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase font-extrabold tracking-wider leading-none">
                Pipeline Status: {jobStatus?.status || "Starting"}
              </p>
              <p className="text-xs md:text-sm mt-1 truncate opacity-90 font-medium">
                {jobProgressMsg}
              </p>
            </div>
          </div>
        )}

        {/* Dashboard Analytics Bar */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 p-5 rounded-[16px] shadow-[0_2px_4px_-2px_rgb(0,0,0,0.05)] hover:-translate-y-0.5 transition-transform duration-200">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Total Clusters</p>
              <div className="p-1.5 bg-[#6D5EF6]/10 rounded-lg text-[#6D5EF6]">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">{clusters.length}</h3>
              <span className="text-xs font-medium text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded-full flex items-center">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> 12%
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 p-5 rounded-[16px] shadow-[0_2px_4px_-2px_rgb(0,0,0,0.05)] hover:-translate-y-0.5 transition-transform duration-200">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Indexed Articles</p>
              <div className="p-1.5 bg-sky-500/10 rounded-lg text-sky-600 dark:text-sky-400">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">{totalArticles}</h3>
              <span className="text-xs font-medium text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded-full flex items-center">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> 8%
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 p-5 rounded-[16px] shadow-[0_2px_4px_-2px_rgb(0,0,0,0.05)] hover:-translate-y-0.5 transition-transform duration-200">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">RSS Sources</p>
              <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-600 dark:text-amber-400">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">{sourcesList.length}</h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 p-5 rounded-[16px] shadow-[0_2px_4px_-2px_rgb(0,0,0,0.05)] hover:-translate-y-0.5 transition-transform duration-200">
            <div className="flex justify-between items-start mb-4">
              <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Last Ingestion Time</p>
              <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">{lastIngestionTimeText.time}</h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{lastIngestionTimeText.context}</span>
            </div>
          </div>
        </section>

        {/* Filters Controls Panel */}
        <section className="bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 p-3 rounded-[16px] shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search topic keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200/80 dark:border-slate-850 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:focus:ring-violet-400/25 transition-all text-slate-700 dark:text-slate-200"
              />
            </div>

            {/* Time Window Buttons and Source Select Filter */}
            <div className="flex flex-wrap items-center gap-3.5 pb-1 md:pb-0">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-violet-500/25 transition-all cursor-pointer"
                >
                  <option value="all">All Sources</option>
                  {sourcesList.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                </select>
              </div>


            </div>

            {/* Time Window Buttons */}
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-[#E5E7EB] dark:border-slate-800">
              {[
                { label: "24H", days: 1 },
                { label: "3D", days: 3 },
                { label: "7D", days: 7 },
                { label: "30D", days: 30 }
              ].map((win) => (
                <button
                  key={win.days}
                  onClick={() => setTimeWindowDays(win.days)}
                  className={`px-3 py-1 rounded-md text-[13px] font-medium transition-all whitespace-nowrap ${
                    timeWindowDays === win.days
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {win.label}
                </button>
              ))}
            </div>

          </div>
        </section>

        {/* Main Content Area: Timeline and Details View Split */}
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8 items-start">
          
          {/* Left Column: Timeline view (occupies 3 cols on large screen = 75%) */}
          <div className="lg:col-span-3 flex flex-col space-y-4">
            <div className="flex justify-between items-center px-1">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                  Topic Clusters Timeline
                </h2>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Interactive visualization of emerging narratives
                </p>
              </div>
              <span className="text-xs font-extrabold bg-slate-100 dark:bg-slate-900 border border-slate-200/30 dark:border-slate-850 px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400">
                {filteredTimelineData.length} clusters
              </span>
            </div>

            {isClustersLoading ? (
              <div className="h-[600px] lg:h-[calc(100vh-14rem)] flex flex-col items-center justify-center p-20 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-semibold text-slate-400">Loading topic timeline...</p>
              </div>
            ) : clustersError ? (
              <div className="h-[600px] lg:h-[calc(100vh-14rem)] p-8 border border-red-200/50 dark:border-red-900/30 bg-red-500/5 rounded-2xl text-red-500 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="w-8 h-8 mb-3" />
                <p className="font-bold">Error Loading Timeline</p>
                <p className="text-xs mt-1">Please ensure the backend Express server is running on port 3001.</p>
              </div>
            ) : (
              <div className="h-[600px] lg:h-[calc(100vh-14rem)]">
                <Timeline
                  clusters={filteredTimelineData}
                  onSelectCluster={setSelectedClusterId}
                  selectedClusterId={selectedClusterId}
                  timeWindowDays={timeWindowDays}
                />
              </div>
            )}
          </div>

          {/* Right Column: Cluster details (occupies 1 col = 25%) */}
          <div className="flex flex-col space-y-4">
            {/* Invisible spacer to push the right card down so it aligns with the left card */}
            <div className="hidden lg:flex justify-between items-center px-1 invisible">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Dummy</h2>
                <p className="text-[13px] mt-0.5">Dummy</p>
              </div>
            </div>
            
            <div className="h-[600px] lg:h-[calc(100vh-14rem)] bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-800 rounded-[16px] shadow-sm overflow-hidden sticky top-24 flex flex-col">
              <ClusterDetails
                clusterId={selectedClusterId}
                onClose={() => setSelectedClusterId(undefined)}
              />
            </div>
          </div>

        </section>

      </main>
    </div>
  );
}
