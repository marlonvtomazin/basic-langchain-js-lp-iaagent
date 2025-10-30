const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { TavilySearch } = require("@langchain/tavily");

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
        
        const llm = new ChatGoogleGenerativeAI({
            model: 'gemini-2.5-flash',
            temperature: 0.2,
            apiKey: process.env.GOOGLE_API_KEY,
        });

        const searchTool = new TavilySearch({ 
            maxResults: 2,
            apiKey: process.env.TAVILY_API_KEY,
        });
        
        const messages = [
            {
                role: "system",
                content: `Você é um Assistente farmacêutico especializado em medicamentos e dosagens.
                        Responda sempre em texto puro, nunca retorne objetos JSON ou estruturas complexas.
                        Seja claro e conciso nas respostas.`
            },
            ...chatHistory,
            { role: "human", content: message }
        ];

        console.log('📤 Enviando para Gemini:', message);
        
        // 🔥 MUDANÇA: Não passar tools inicialmente
        const response = await llm.invoke(messages);
        
        console.log('📥 Resposta bruta do Gemini:', response);
        
        // 🔥 CORREÇÃO: Extrair conteúdo de forma robusta
        let responseContent = '';
        
        if (typeof response.content === 'string') {
            responseContent = response.content;
        } else if (response.content && response.content[0] && response.content[0].text) {
            // Se for array com objetos text
            responseContent = response.content[0].text;
        } else if (response.text) {
            // Se tiver propriedade text direta
            responseContent = response.text;
        } else {
            // Fallback: converter para string
            responseContent = JSON.stringify(response);
            console.warn('⚠️  Resposta inesperada, usando fallback:', responseContent);
            
            // Tentar extrair texto de qualquer maneira
            try {
                const responseStr = JSON.stringify(response);
                if (responseStr.includes('"text"')) {
                    const match = responseStr.match(/"text":"([^"]+)"/);
                    if (match) responseContent = match[1];
                }
            } catch (e) {
                responseContent = "Desculpe, não consegui processar a resposta.";
            }
        }

        // Limpar possíveis caracteres especiais
        responseContent = responseContent.replace(/\\n/g, '\n').trim();

        console.log('💊 Resposta final:', responseContent);

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
        console.error('❌ Erro completo:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};