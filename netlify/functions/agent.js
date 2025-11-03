const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { TavilySearch } = require("@langchain/tavily");
const { MongoClient } = require('mongodb'); // NOVO: Import do MongoDB

// Conexão e Caching do Banco de Dados (Melhora o desempenho no Netlify)
let cachedDb = null;
const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'ai_agents_db'; // Nome do seu banco de dados no Atlas
const COLLECTION_NAME = 'agents'; // Nome da coleção onde os agentes estão salvos

// Função para conectar ao banco ou usar o cache
async function connectToDatabase(uri) {
    if (cachedDb) {
        return cachedDb;
    }

    const client = await MongoClient.connect(uri, { 
        useNewUrlParser: true, 
        useUnifiedTopology: true 
    });
    
    const db = client.db(DB_NAME);
    cachedDb = db;
    return db;
}

// Configurações padrão caso o banco falhe ou o agente não seja encontrado
const FALLBACK_AGENT_CONFIG = {
    // ID 1 é o agente farmacêutico padrão
    AgentID: 1, 
    AgentName: "Assistente Farmacêutico",
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
    // Garante que o contexto de login está disponível
    context.callbackWaitsForEmptyEventLoop = false; // Melhoria de desempenho no Netlify
    
    // Proteção da função: Identity (mantida)
    if (!context.clientContext || !context.clientContext.user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ 
                error: "Acesso não autorizado. Por favor, faça login." 
            })
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
        const { message: question, chatHistory, agentId } = JSON.parse(event.body); // NOVO: Recebe agentId
        
        // Etapa 1: Obter Configurações do Agente do MongoDB
        let agentConfig = FALLBACK_AGENT_CONFIG;
        try {
            const db = await connectToDatabase(MONGODB_URI);
            const collection = db.collection(COLLECTION_NAME);
            
            // Busca o agente com base no ID (você pode mudar para AgentName se preferir)
            const agentData = await collection.findOne({ AgentID: parseInt(agentId) || 1 });
            
            if (agentData) {
                agentConfig = {
                    AgentID: agentData.AgentID,
                    AgentName: agentData.AgentName,
                    systemPrompt: agentData.systemPrompt,
                    shouldSearchPrompt: agentData.shouldSearchPrompt,
                    // Adicione aqui todos os outros campos dinâmicos que você criar
                };
            }
        } catch (dbError) {
            console.error('❌ Erro de conexão/busca no MongoDB, usando config padrão:', dbError.message);
            // Continua com a configuração padrão
        }

        // Configuração LLM e Tavily (Agora usa as variáveis de ambiente)
        const modelConfig = {
            model: 'gemini-2.5-flash',
            temperature: 0.2,
            apiKey: process.env.GOOGLE_API_KEY,
        };
        const searchConfig = {
            maxResults: 3,
            apiKey: process.env.TAVILY_API_KEY,
        };

        // Inicializa o LLM e a Ferramenta de Busca
        const llm = new ChatGoogleGenerativeAI(modelConfig);
        const searchTool = new TavilySearch(searchConfig);
        
        // Etapa 2: Decidir se precisa de busca usando o prompt dinâmico
        const needsSearch = await decideIfSearchIsNeeded(question, llm, agentConfig.shouldSearchPrompt);

        let responseText;

        if (needsSearch) {
            // Etapa 3A: Resposta com busca (RAG)
            responseText = await getResponseWithSearch(question, llm, searchTool, agentConfig.systemPrompt);
        } else {
            // Etapa 3B: Resposta direta (Somente contexto e memória)
            responseText = await getDirectResponse(question, chatHistory, llm, agentConfig.systemPrompt);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ response: responseText }),
        };

    } catch (error) {
        console.error('❌ Erro na execução da função principal:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Erro interno do servidor: ${error.message}` }),
        };
    }
};


// FUNÇÃO: Decidir se é necessário buscar (Recebe o prompt dinâmico)
async function decideIfSearchIsNeeded(question, llm, promptTemplate) {
    try {
        const prompt = promptTemplate.replace('{question}', question);
        const response = await llm.invoke([{ role: "human", content: prompt }]);
        const decision = String(response.content).trim().toUpperCase();
        return decision === 'SIM';
    } catch (error) {
        return true; 
    }
}

// FUNÇÃO: Resposta com busca (Recebe o systemPrompt dinâmico)
async function getResponseWithSearch(question, llm, searchTool, systemPrompt) {
    const searchResult = await searchTool.invoke({
        query: `informações sobre: ${question}` // Query mais genérica para funcionar com qualquer agente
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
        ...chatHistory.map(msg => ({ role: msg.role, content: msg.content })),
        { role: "human", content: question }
    ];
    
    const response = await llm.invoke(messages);
    
    return String(response.content).trim();
}