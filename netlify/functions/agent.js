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
        const { message } = JSON.parse(event.body);
        
        console.log('📤 Pergunta recebida:', message);

        // Chamada DIRETA para a API do Google Gemini
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Você é um assistente farmacêutico especializado. Responda de forma clara e concisa.

Pergunta: ${message}

Responda:`
                    }]
                }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 1000,
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Erro na API: ${response.status}`);
        }

        const data = await response.json();
        
        // Extrair resposta
        const responseText = data.candidates[0].content.parts[0].text;
        
        console.log('💊 Resposta gerada:', responseText);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                response: responseText
            })
        };
    } catch (error) {
        console.error('❌ Erro:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: "Desculpe, estou com problemas técnicos.",
                details: error.message 
            })
        };
    }
};