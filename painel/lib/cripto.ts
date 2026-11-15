/**
 * CRIPTOGRAFIA DAS CHAVES das integrações, no painel. A chave-mestra fica SÓ na variável secreta
 * CHAVE_MESTRA do servidor (Cloudflare ▸ Secrets); o motor usa a mesma, para ler as chaves do banco.
 * O banco guarda apenas o texto cifrado. A lógica está em lib/banco/cifra.ts.
 */
import "server-only";
import { chaveMestraValida, cifrarCom, decifrarCom } from "@/lib/banco/cifra.ts";

export const chaveMestraConfigurada = () => chaveMestraValida(process.env.CHAVE_MESTRA);
export const cifrar = (texto: string, nome: string) => cifrarCom(process.env.CHAVE_MESTRA, texto, nome);
export const decifrar = (cifrado: string, nome: string) => decifrarCom(process.env.CHAVE_MESTRA, cifrado, nome);

/** Últimos 4 caracteres, para a pessoa reconhecer qual chave está salva. */
export const finalDaChave = (texto: string) => texto.trim().slice(-4);
