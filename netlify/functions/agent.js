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

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { message, chatHistory = [] } = JSON.parse(event.body);
        
        const llm = new ChatGoogleGenerativeAI(AGENT_CONFIG.modelConfig);
        const searchTool = new TavilySearch(AGENT_CONFIG.searchConfig);
        
        console.log('📤 Pergunta:', message);
        
        // DECIDIR SE FAZ BUSCA
        const needsSearch = await shouldSearch(message, llm);
        let responseContent = '';

        if (needsSearch) {
            console.log('🔍 Buscando informações...');
            responseContent = await getResponseWithSearch(message, llm, searchTool);
        } else {
            console.log('💭 Respondendo com conhecimento interno...');
            responseContent = await getDirectResponse(message, chatHistory, llm);
        }
        
        console.log('💊 Resposta:', responseContent);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                response: responseContent,
                chatHistory: [
                    ...chatHistory, 
                    { role: "human", content: message },
                    { role: "assistant", content: responseContent }
                ]
            })
        };
    } catch (error) {
        console.error('❌ Erro:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};

// FUNÇÃO: Decidir se faz busca
async function shouldSearch(question, llm) {
    try {
        const prompt = AGENT_CONFIG.shouldSearchPrompt.replace('{question}', question);
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
        ...chatHistory,
        { role: "human", content: question }
    ];

    const response = await llm.invoke(messages);
    return String(response.content).trim();
}