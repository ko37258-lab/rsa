import { z } from "zod";
import { route, requireUser, ok, readJson } from "@/lib/api/http";
import { BriefSchema } from "@/lib/design/schema";
import { createProject, listProjects, publicProject } from "@/lib/services/projects";

/** 내 프로젝트 목록 */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const rows = await listProjects(user.id);
  return ok({ projects: rows.map(publicProject) });
});

const CreateBody = z.object({ title: z.string().max(60).optional(), brief: BriefSchema });

/** 프로젝트 생성 (브리프 저장). 디자인 생성은 /generate 로 별도 호출 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, CreateBody);
  const row = await createProject(user.id, body.brief, body.title);
  return ok({ project: publicProject(row) }, 201);
});
