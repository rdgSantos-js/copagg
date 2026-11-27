// ------------------------------------------------------------------------------------------
// Configura um cliente Axios reutilizável para a API REST da integração PandaScore.
// Carrega o token do ambiente e define URL-base, autenticação Bearer, JSON e timeout.
// Falha claramente quando o token não está configurado.
// ------------------------------------------------------------------------------------------




import "dotenv/config";
import axios from "axios";
import { attachPandaScoreRequestLogging } from "./requestLog.js";

const PANDASCORE_BASE_URL = "https://api.pandascore.co";
const REQUEST_TIMEOUT_MS = 10_000;

// Lê o token configurado no ambiente para autenticar as chamadas à PandaScore.
const token = process.env.PANDASCORE_TOKEN?.trim();

if (!token) {
  throw new Error("PANDASCORE_TOKEN is missing. Add it to the .env file.");
}

// Exporta um cliente Axios autenticado e instrumentado para registrar cada requisição.
export const pandascore = attachPandaScoreRequestLogging(
  axios.create({
    baseURL: PANDASCORE_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }),
);
