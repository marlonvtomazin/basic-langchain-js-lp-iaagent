const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { TavilySearch } = require("@langchain/tavily");

// CONFIGURAÇÃO DO AGENTE (FÁCIL DE MODIFICAR)
const AGENT_CONFIG = {
    // Prompt do sistema - PODE SER MODIFICADO FACILMENTE
    systemPrompt: `Você é um Assistente farmacêutico especializado em medicamentos e dosagens.
Use a ferramenta de busca quando precisar de informações atualizadas ou específicas.
Seja claro, conciso e forneça informações precisas.`,

    // Configuração do modelo
    modelConfig: {
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        apiKey: process.env.GOOGLE_API_KEY,
    },

    // Configuração da busca
    searchConfig: {
        maxResults: 3,
        apiKey: process.env.TAVILY_API_KEY,
    },

    // Quando usar busca (PODE SER MODIFICADO)
    shouldSearchPrompt: `Analise se esta pergunta sobre medicamentos precisa de busca por informações atualizadas:

Pergunta: "{question}"

Responda APENAS com "SIM" ou "NÃO":
- "SIM": para informações recentes, dosagens específicas, atualizações, interações medicamentosas
- "NÃO": para conceitos básicos, definições, perguntas gerais

Resposta:`
};

exports.handler = async (event, context) => { // NOVO: 'context' para dados do Identity
    
    // NOVO: Proteção da função. Verifica se o Netlify autenticou um usuário.
    if (!context.clientContext || !context.clientContext.user) {
        console.error("🚫 Acesso negado: Usuário não autenticado.");
        return {
            statusCode: 401,
            body: JSON.stringify({ 
                error: "Acesso não autorizado. Por favor, faça login." 
            })
        };
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Necessário para CORS
    };

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método não permitido' }),
        };
    }

    try {
        const { message: question, chatHistory } = JSON.parse(event.body);

        if (!question) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Mensagem não fornecida' }),
            };
        }

        // Inicializa o LLM e a Ferramenta de Busca
        const llm = new ChatGoogleGenerativeAI(AGENT_CONFIG.modelConfig);
        const searchTool = new TavilySearch(AGENT_CONFIG.searchConfig);
        
        // Etapa 1: Decidir se precisa de busca
        const needsSearch = await decideIfSearchIsNeeded(question, llm, AGENT_CONFIG.shouldSearchPrompt);

        let responseText;

        if (needsSearch) {
            // Etapa 2A: Resposta com busca (RAG)
            responseText = await getResponseWithSearch(question, llm, searchTool);
        } else {
            // Etapa 2B: Resposta direta (Somente contexto e memória)
            responseText = await getDirectResponse(question, chatHistory, llm);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ response: responseText }),
        };

    } catch (error) {
        console.error('❌ Erro na execução da função:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Erro interno do servidor: ${error.message}` }),
        };
    }
};


// FUNÇÃO: Decidir se é necessário buscar
async function decideIfSearchIsNeeded(question, llm, promptTemplate) {
    try {
        const prompt = promptTemplate.replace('{question}', question);
        const response = await llm.invoke([{ role: "human", content: prompt }]);
        const decision = String(response.content).trim().toUpperCase();
        console.log('🤔 Decisão de busca:', decision);
        return decision === 'SIM';
    } catch (error) {
        console.log('⚠️  Erro na decisão, buscando por padrão');
        return true; // Fallback: busca por padrão
    }
}

// FUNÇÃO: Resposta com busca
async function getResponseWithSearch(question, llm, searchTool) {
    const searchResult = await searchTool.invoke({
        query: `informações farmacêuticas sobre: ${question}`
    });
    
    const enhancedPrompt = `${AGENT_CONFIG.systemPrompt}

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

// FUNÇÃO: Resposta direta
async function getDirectResponse(question, chatHistory, llm) {
    const messages = [
        { role: "system", content: AGENT_CONFIG.systemPrompt },
        ...chatHistory.map(msg => ({ role: msg.role, content: msg.content })),
        { role: "human", content: question }
    ];
    
    const response = await llm.invoke(messages);
    
    return String(response.content).trim();
}