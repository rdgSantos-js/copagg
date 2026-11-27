// ------------------------------------------------------------------------------------------
// Cria a aplicação Express e registra o middleware JSON e a rota de leitura dos placares
// ao vivo de Counter-Strike. Exporta a instância sem abrir a porta nem iniciar tarefas
// periódicas, permitindo que o servidor a inicialize e que os testes façam requisições
// isoladas sem chamadas externas.
// ------------------------------------------------------------------------------------------




import express from "express";
import csgoCatalog from "./routes/csgoCatalog.js";
import csgoLiveScores from "./routes/csgoLiveScores.js";

// Cria a instância Express que será iniciada pelo servidor ou reutilizada nos testes.
const app = express();

// Registra o middleware JSON e a rota local de placares de Counter-Strike.
app.use(express.json());
app.use("/api/csgo", csgoCatalog);
app.use("/api/csgo/live-scores", csgoLiveScores);

export default app;
