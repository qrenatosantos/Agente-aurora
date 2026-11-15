/**
 * MENU DO PAINEL — sidebar (computador) e barra inferior (celular) são geradas daqui.
 *
 * No celular aparecem no máximo 4 itens com `celular: true`; o restante vai para "Mais".
 * `gestor: true` = só aparece para o gestor (a regra de verdade fica no banco, RLS).
 * `fase` = tela que chega numa fase seguinte (aparece no menu com o selo "em breve").
 */
import {
  BookOpen,
  Bot,
  History,
  Home,
  MessagesSquare,
  PhoneForwarded,
  PlugZap,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type ItemNavegacao = {
  titulo: string;
  href: string;
  icone: LucideIcon;
  celular?: boolean;
  gestor?: boolean;
  grupo?: string;
};

export const NAVEGACAO: ItemNavegacao[] = [
  { titulo: "Visão geral", href: "/", icone: Home, celular: true },
  { titulo: "Agente", href: "/agente", icone: Bot, celular: true, grupo: "Configurar e treinar" },
  { titulo: "Conhecimento", href: "/conhecimento", icone: BookOpen, celular: true },
  { titulo: "Transferência e horários", href: "/transferencia", icone: PhoneForwarded },
  { titulo: "Integrações", href: "/integracoes", icone: PlugZap, gestor: true, grupo: "Administração" },
  { titulo: "Equipe", href: "/equipe", icone: UsersRound, gestor: true },
  { titulo: "Registro e versões", href: "/registro", icone: History, gestor: true },
];

/** Telas das próximas fases (mostradas na Visão geral para o André saber o que vem). */
export const PROXIMAS_TELAS: { titulo: string; icone: LucideIcon; fase: number; descricao: string }[] = [
  { titulo: "Simulador", icone: MessagesSquare, fase: 2, descricao: "Conversar com o agente como se fosse um cliente, sem gravar nada no CRM." },
  { titulo: "Conversas", icone: MessagesSquare, fase: 4, descricao: "Caixa de entrada do WhatsApp: assumir, responder e pausar por conversa." },
  { titulo: "Correções", icone: BookOpen, fase: 5, descricao: "Marcar uma resposta ruim e ensinar a certa." },
  { titulo: "Retomadas e modelos", icone: PhoneForwarded, fase: 5, descricao: "Mensagens de retomada com modelos aprovados pela Meta." },
];

export function menuPara(gestor: boolean) {
  return NAVEGACAO.filter((i) => gestor || !i.gestor);
}

export const NOME_APP = "Aurora Bartenders";
export const DESCRICAO_APP = "Painel do atendimento automático";
export const SUBTITULO_MENU = "Agente de atendimento";

/** Item ativo: "/" só quando exato; demais por prefixo. */
export function itemAtivo(caminho: string, href: string) {
  if (href === "/") return caminho === "/";
  return caminho === href || caminho.startsWith(href + "/");
}
