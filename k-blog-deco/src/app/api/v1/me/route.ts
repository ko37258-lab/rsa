import { route, requireUser, ok } from "@/lib/api/http";
import { toPublicUser } from "@/lib/auth/users";

export const GET = route(async (req) => ok({ user: toPublicUser(await requireUser(req)) }));
