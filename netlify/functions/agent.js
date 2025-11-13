const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { TavilySearch } = require("@langchain/tavily");
const { MongoClient } = require('mongodb'); 

// Conexão e Caching do Banco de Dados (Essencial para performance no Netlify)
let cachedDb = null;
const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'ai_agents_db'; 
const AGENTS_COLLECTION_NAME = 'agents'; 
const HISTORY_COLLECTION_NAME = 'chat_history'; // ✅ NOVO: Coleção de histórico

// netlify/functions/agent.js
async function connectToDatabase(uri) {
    if (cachedDb) {
        return cachedDb;
    }
    const client = await MongoClient.connect(uri);
    const db = client.db(DB_NAME);
    cachedDb = db;
    return db;
}

// Configurações padrão (Fallback) caso o banco falhe ou o agente não seja encontrado
const FALLBACK_AGENT_CONFIG = {
    AgentID: 1, 
    AgentName: "Assistente Padrão (Fallback)",
    systemPrompt: `Você é um Assistente farmacêutico especializado em medicamentos e dosagens. 
Use a ferramenta de busca quando precisar de informações atualizadas ou específicas.
Seja claro, conciso e forneça informações precisas.`,
    shouldSearchPrompt: `Analise se esta pergunta sobre medicamentos precisa de busca por informações atualizadas:

    Pergunta: "{question}"

    Responda APENAS com "SIM" ou "NÃO":
    - "SIM": para informações recentes, dosagens específicas, atualizações, interações medicamentosas
    - "NÃO": para conceitos básicos, definições, perguntas gerais

    Resposta:`,
};

exports.handler = async (event, context) => {
    // 1. Proteção de acesso: Apenas usuários logados
    if (!context.clientContext || !context.clientContext.user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: "Acesso não autorizado. Por favor, faça login." })
        };
    }

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
    }

    try {
        const { message, chatHistory, agentId, userEmail } = JSON.parse(event.body);

        if (!message || !agentId || !userEmail) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Dados obrigatórios (message, agentId, userEmail) faltando.' }),
            };
        }
        
        const db = await connectToDatabase(MONGODB_URI);
        const agentsCollection = db.collection(AGENTS_COLLECTION_NAME);
        
        // 2. Busca a configuração do agente no DB
        let agentConfig = FALLBACK_AGENT_CONFIG;
        if (parseInt(agentId) > 1) {
            const dbConfig = await agentsCollection.findOne({ AgentID: parseInt(agentId) });
            if (dbConfig) {
                agentConfig = dbConfig;
            } else {
                console.log(`Agente ID ${agentId} não encontrado. Usando configuração padrão.`);
            }
        }
        
        // 3. Inicializa o LLM e a ferramenta de busca
        const llm = new ChatGoogleGenerativeAI({
            model: "gemini-2.5-flash",
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0.2
        });
        const searchTool = new TavilySearch({ apiKey: process.env.TAVILY_API_KEY });
        
        let responseText = '';

        // 4. Decisão de busca
        const needsSearch = await shouldPerformSearch(message, llm, agentConfig.shouldSearchPrompt);

        if (needsSearch) {
            responseText = await getResponseWithSearch(message, llm, searchTool, agentConfig.systemPrompt);
        } else {
            responseText = await getDirectResponse(message, chatHistory, llm, agentConfig.systemPrompt);
        }
        
        // =================================================================
        // ✅ NOVO: PERSISTÊNCIA DO HISTÓRICO NO MONGODB
        // =================================================================
        
        // Constrói o novo array de histórico com a nova interação
        const newHistory = [
            ...chatHistory,
            { role: "human", content: message },
            { role: "assistant", content: responseText }
        ];

        const historyCollection = db.collection(HISTORY_COLLECTION_NAME);

        // O upsert busca pelo par (agentId, userEmail). Se encontrar, atualiza. Se não, insere.
        await historyCollection.updateOne(
            { agentId: parseInt(agentId), userEmail: userEmail },
            { 
                $set: { 
                    chatHistory: newHistory,
                    updatedAt: new Date()
                },
                $setOnInsert: { // Define apenas na primeira inserção (novo registro)
                    createdAt: new Date()
                }
            },
            { upsert: true } // Cria o documento se não existir
        );

        console.log(`✅ Histórico atualizado para User: ${userEmail}, AgentID: ${agentId}`);

        // =================================================================
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ response: responseText }),
        };

    } catch (error) {
        console.error('❌ Erro na função agent:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Falha interna: ${error.message}` }),
        };
    }
};

// FUNÇÃO: Decide se deve buscar na web
async function shouldPerformSearch(question, llm, searchPrompt) {
    if (!searchPrompt) return false; // Se não tiver prompt de decisão, não busca.

    const prompt = searchPrompt.replace("{question}", question);

    try {
        const response = await llm.invoke([{ role: "human", content: prompt }]);
        const decision = String(response.content).trim().toUpperCase();
        return decision === 'SIM';
    } catch (error) {
        console.log('⚠️ Erro na decisão do LLM, buscando por padrão.');
        return true; 
    }
}

// FUNÇÃO: Resposta com busca (Recebe o systemPrompt dinâmico)
async function getResponseWithSearch(question, llm, searchTool, systemPrompt) {
    const searchResult = await searchTool.invoke({
        query: `informações sobre: ${question}` 
    });
    
    const enhancedPrompt = `${systemPrompt}

    Baseie sua resposta nestas informações encontradas:

    INFORMAÇÕES ENCONTRADAS:
    ${JSON.stringify(searchResult)}

    PERGUNTA DO USUÁRIO:
    ${question}

    Responda de forma clara e organizada:`;

    const response = await llm.invoke([
        { role: "system", content: enhancedPrompt },
        { role: "human", content: question }
    ]);
    
    return String(response.content).trim();
}

// FUNÇÃO: Resposta direta (Recebe o systemPrompt dinâmico)
async function getDirectResponse(question, chatHistory, llm, systemPrompt) {
    const messages = [
        { role: "system", content: systemPrompt },
        // Mapeia o histórico para o formato de mensagens do LLM
        ...chatHistory.map(msg => ({ role: msg.role === 'human' ? 'user' : 'model', content: msg.content })),
        { role: "user", content: question }
    ];
    
    const response = await llm.invoke(messages);
    
    return String(response.content).trim();
}