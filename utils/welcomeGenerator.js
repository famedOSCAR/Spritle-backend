
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

// Registrar fuentes (opcional - mejora la apariencia)
// Puedes agregar fuentes personalizadas aquí si las tienes
// GlobalFonts.registerFromPath('./fonts/YourFont.ttf', 'CustomFont');

function isColor(str) {
    return /^#([0-9A-F]{3}){1,2}$/i.test(str) ||
        /^rgb/i.test(str) ||
        /^[a-zA-Z]+$/.test(str);
}

function parsePlaceholders(str, user, guild) {
    return str
        .replace(/{user}/g, user.globalName || user.username)
        .replace(/{server}/g, guild.name)
        .replace(/{member}/g, "@" + (user.globalName || user.username))
        .replace(/{mention}/g, `<@${user.id}>`);
}

// ✨ MEJORADO: Convierte emojis Unicode a imágenes de Twemoji
// Reemplaza la función drawTextWithEmojis (línea 27) por esta versión mejorada:
async function drawTextWithEmojis(ctx, text, x, y, fontSize, maxWidth) {
    const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Component}+)/gu;
    
    let currentX = x;
    let parts = [];
    let lastIndex = 0;
    
    text.replace(emojiRegex, (match, emoji, offset) => {
        if (offset > lastIndex) {
            parts.push({ type: 'text', content: text.slice(lastIndex, offset) });
        }
        parts.push({ type: 'emoji', content: emoji });
        lastIndex = offset + match.length;
        return match;
    });
    
    if (lastIndex < text.length) {
        parts.push({ type: 'text', content: text.slice(lastIndex) });
    }
    
    for (const part of parts) {
        if (part.type === 'text') {
            ctx.fillText(part.content, currentX, y);
            currentX += ctx.measureText(part.content).width;
        } else if (part.type === 'emoji') {
            try {
                // ⭐ Convertir todos los codepoints para emojis compuestos
                const codepoints = [...part.content]
                    .map(char => char.codePointAt(0).toString(16))
                    .join('-');
                    
                const emojiUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoints}.png`;
                
                const emojiImg = await loadImage(emojiUrl);
                const emojiSize = fontSize * 1.1;
                
                ctx.drawImage(
                    emojiImg, 
                    currentX, 
                    y - emojiSize * 0.8, 
                    emojiSize, 
                    emojiSize
                );
                
                currentX += emojiSize * 0.95;
            } catch (err) {
                console.error(`Error cargando emoji ${part.content}:`, err.message);
                ctx.fillText(part.content, currentX, y);
                currentX += ctx.measureText(part.content).width;
            }
        }
    }
}

// ✨ MEJORADO: Ajuste de texto multilínea con mejor espaciado
function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    let lines = [];
    let line = "";

    for (let word of words) {
        const testLine = line + (line ? " " : "") + word;
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = testLine;
        }
    }
    
    if (line) {
        lines.push(line);
    }
    
    return lines;
}

// ✨ MEJORADO: Añadir sombra al texto para mejor legibilidad
function addTextShadow(ctx, color = 'rgba(0, 0, 0, 0.7)', blur = 8, offsetX = 0, offsetY = 4) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = offsetX;
    ctx.shadowOffsetY = offsetY;
}

// ✨ MEJORADO: Remover sombra
function clearTextShadow(ctx) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

// ✨ NUEVO: Dibujar avatar del usuario con borde circular
async function drawAvatar(ctx, avatarUrl, x, y, size) {
    try {
        const avatar = await loadImage(avatarUrl);
        
        // Guardar contexto
        ctx.save();
        
        // Crear clip circular
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // Dibujar avatar
        ctx.drawImage(avatar, x - size / 2, y - size / 2, size, size);
        
        // Restaurar contexto
        ctx.restore();
        
        // Dibujar borde circular
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.stroke();
        
        // Borde exterior con sombra
        ctx.beginPath();
        ctx.arc(x, y, size / 2 + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        return true;
    } catch (err) {
        console.error("Error cargando avatar:", err);
        return false;
    }
}

// ✨ MEJORADO: Generador principal con diseño profesional
async function generateWelcomeImage({ 
    bgColor, 
    image, 
    textColor, 
    fontSize, 
    message,
    user,        // Nuevo: objeto del usuario
    guild        // Nuevo: objeto del servidor
}) {
    const width = 1400;
    const height = 500;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // ====== FONDO ======
    
    // Fondo con gradiente por defecto si no hay color/imagen
    if (!bgColor && !image) {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
    
    // Fondo sólido
    if (bgColor && isColor(bgColor)) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
    }

    // Imagen de fondo con overlay oscuro para mejor legibilidad
    if (image) {
        try {
            const bgImage = await loadImage("." + image);
            ctx.drawImage(bgImage, 0, 0, width, height);
            
            // Overlay semi-transparente para mejorar legibilidad
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(0, 0, width, height);
        } catch (err) {
            console.error("Error cargando imagen de fondo:", err);
        }
    }
    const vignette = ctx.createRadialGradient(width / 2, height / 2, 200, width / 2, height / 2, width);
vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
ctx.fillStyle = vignette;
ctx.fillRect(0, 0, width, height);
    // ====== DECORACIÓN ======
    
    // Barra superior decorativa
    const topGradient = ctx.createLinearGradient(0, 0, width, 0);
    topGradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)');
    topGradient.addColorStop(0.5, 'rgba(147, 51, 234, 0.8)');
    topGradient.addColorStop(1, 'rgba(59, 130, 246, 0.8)');
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, width, 8);
    
    // Barra inferior decorativa
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, height - 8, width, 8);

    // ====== AVATAR DEL USUARIO ======
    
    const avatarSize = 140;
    const avatarX = 120;
    const avatarY = height / 2;
    
    if (user) {
        const avatarUrl = user.avatar 
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`;
        
        await drawAvatar(ctx, avatarUrl, avatarX, avatarY, avatarSize);
    }

    // ====== TEXTO ======
    
    let realFontSize = Number(fontSize);
    if (isNaN(realFontSize) || realFontSize < 40) realFontSize = 40;
    if (realFontSize > 100) realFontSize = 100;

    // Configurar fuente con peso bold para mejor legibilidad
    ctx.font = `bold ${realFontSize}px "Arial", "Segoe UI Emoji", sans-serif`;
    ctx.fillStyle = textColor || "#ffffff";
    ctx.textBaseline = "middle";

    // Área de texto (después del avatar)
    const textStartX = avatarX + avatarSize / 2 + 60;
    const textMaxWidth = width - textStartX - 60;
    
    // Dividir mensaje en líneas
    const lines = wrapText(ctx, message, textMaxWidth);
    
    // Calcular altura total del texto
    const lineHeight = realFontSize * 1.4;
    const totalTextHeight = lines.length * lineHeight;
    const textStartY = (height - totalTextHeight) / 2 + lineHeight / 2;

    // Dibujar cada línea con sombra para mejor legibilidad
    for (let i = 0; i < lines.length; i++) {
        const y = textStartY + i * lineHeight;
        
        // Sombra para mejorar legibilidad
        addTextShadow(ctx, 'rgba(0, 0, 0, 0.8)', 10, 2, 4);
        
        // Centrar texto en el área disponible
        const lineWidth = ctx.measureText(lines[i]).width;
        const x = textStartX + (textMaxWidth - lineWidth) / 2;
        
        // Dibujar texto con emojis
        ctx.textAlign = 'left';
        await drawTextWithEmojis(ctx, lines[i], x, y, realFontSize, textMaxWidth);
        
        clearTextShadow(ctx);
    }

    // ====== SUBTÍTULO (Opcional: nombre del servidor) ======
    
    if (guild) {
    ctx.font = `500 ${realFontSize * 0.4}px "Arial", sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'center';
    
    addTextShadow(ctx, 'rgba(0, 0, 0, 0.6)', 6, 1, 2);
    
    const subtitleY = textStartY + lines.length * lineHeight + 30;
    const subtitleX = textStartX + textMaxWidth / 2;
    
    // ⭐ Solo mostrar si hay espacio suficiente
    if (subtitleY < height - 40) {
        ctx.fillText(`¡Bienvenido a ${guild.name}!`, subtitleX, subtitleY);
    }
    
    clearTextShadow(ctx);
}

    // ====== GUARDAR IMAGEN ======
    
    const finalName = `/uploads/welcome_${Date.now()}.png`;
    const outputPath = path.join(process.cwd(), "." + finalName);
    
    // Asegurar que la carpeta uploads existe
    const uploadDir = path.join(process.cwd(), "./uploads");
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
    
    return finalName;
}

export { generateWelcomeImage, parsePlaceholders };