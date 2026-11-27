// ------------------------------------------------------------------------------------------
// Configura um cliente Axios reutilizável para a API REST da integração PandaScore.
// Carrega o token do ambiente e define URL-base, autenticação Bearer, JSON e timeout.
// Falha claramente quando o token não está configurado.
// ------------------------------------------------------------------------------------------




import "dotenv/config";
import axios from "axios";

// Lê o token configurado no ambiente para autenticar as chamadas à PandaScore.
const token = process.env.PANDASCORE_TOKEN;

if (!token?.trim()) {
  throw new Error("PANDASCORE_TOKEN is missing. Add it to the .env file.");
}

// Exporta um cliente Axios com autenticação, URL-base e timeout compartilhados.
export const pandascore = axios.create({
  baseURL: "https://api.pandascore.co",
  timeout: 10_000,
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  },
});
