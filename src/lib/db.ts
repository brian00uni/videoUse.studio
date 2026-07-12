// Best-effort persistence to Supabase (projects/sources/edls/sessions).
// Every call is guarded — a DB failure must never block the compute pipeline.

import { supabase } from "./supabase";
import type { Edl, JobStatus } from "./types";

export async function createProject(title: string): Promise<string | null> {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  const owner = u.user?.id;
  if (!owner) return null;
  const { data, error } = await supabase
    .from("projects")
    .insert({ title, owner })
    .select("id")
    .single();
  if (error) {
    console.warn("createProject failed", error.message);
    return null;
  }
  return data.id;
}

export async function addSource(
  projectId: string,
  storagePath: string,
  filename: string,
  durationS?: number,
  transcript?: unknown,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("sources").insert({
    project_id: projectId,
    storage_path: storagePath,
    filename,
    duration_s: durationS,
    transcript,
  });
  if (error) console.warn("addSource failed", error.message);
}

export async function saveEdl(
  projectId: string,
  edl: Edl,
  status: JobStatus,
  outputPath?: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("edls")
    .insert({ project_id: projectId, edl, status, output_path: outputPath });
  if (error) console.warn("saveEdl failed", error.message);
}

/** The web equivalent of the reference pipeline's project.md session log. */
export async function appendSession(
  projectId: string,
  s: { strategy?: string; decisions?: string; outstanding?: string },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("sessions").insert({ project_id: projectId, ...s });
  if (error) console.warn("appendSession failed", error.message);
}
