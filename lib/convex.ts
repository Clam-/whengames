import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { env } from "@/lib/env";

export const getConvexHttp = () => new ConvexHttpClient(env.convexUrl());
