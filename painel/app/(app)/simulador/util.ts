import { ehUuid } from "@/lib/validacao";

export const validacaoUuid = (v: string) => ehUuid(v);
