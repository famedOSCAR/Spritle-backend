import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

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

function addTextShadow(ctx, color = 'rgba(0, 0, 0, 0.7)', blur = 8, offsetX = 0, offsetY = 4) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = offsetX;
    ctx.shadowOffsetY = offsetY;
}

function clearTextShadow(ctx) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

// ✨ NUEVO: Aplicar efecto blur gaussiano
function applyGaussianBlur(ctx, width, height, radius) {
    if (radius <= 0) return;
    
    // Obtener los datos de imagen
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    
    // Aplicar blur horizontal y vertical
    const blurRadius = Math.min(radius, 50); // Limitar el radio máximo
    
    for (let i = 0; i < 2; i++) {
        const horizontal = i === 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;
                
                for (let offset = -blurRadius; offset <= blurRadius; offset++) {
                    const sampleX = horizontal ? Math.max(0, Math.min(width - 1, x + offset)) : x;
                    const sampleY = horizontal ? y : Math.max(0, Math.min(height - 1, y + offset));
                    const idx = (sampleY * width + sampleX) * 4;
                    
                    r += pixels[idx];
                    g += pixels[idx + 1];
                    b += pixels[idx + 2];
                    a += pixels[idx + 3];
                    count++;
                }
                
                const idx = (y * width + x) * 4;
                pixels[idx] = r / count;
                pixels[idx + 1] = g / count;
                pixels[idx + 2] = b / count;
                pixels[idx + 3] = a / count;
            }
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
}

async function drawAvatar(ctx, avatarUrl, x, y, size) {
    try {
        const avatar = await loadImage(avatarUrl);
        
        ctx.save();
        
        // Crear clip circular
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // Dibujar avatar
        ctx.drawImage(avatar, x - size / 2, y - size / 2, size, size);
        
        ctx.restore();
        
        // Borde con gradiente
        const gradient = ctx.createLinearGradient(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
        gradient.addColorStop(0, '#5865F2');
        gradient.addColorStop(0.5, '#EB459E');
        gradient.addColorStop(1, '#ED4245');
        
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 8;
        ctx.stroke();
        
        // Sombra exterior
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;
        
        ctx.beginPath();
        ctx.arc(x, y, size / 2 + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        
        return true;
    } catch (err) {
        console.error("Error cargando avatar:", err);
        return false;
    }
}

// ✨ NUEVO: Dibujar diseño moderno con glassmorphism
function drawModernBackground(ctx, width, height, bgColor) {
    // Fondo base
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0f0f1e');
    gradient.addColorStop(0.5, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Círculos decorativos con blur
    ctx.save();
    ctx.globalAlpha = 0.15;
    
    // Círculo 1 - Superior izquierda
    const grad1 = ctx.createRadialGradient(width * 0.2, height * 0.3, 0, width * 0.2, height * 0.3, 300);
    grad1.addColorStop(0, '#5865F2');
    grad1.addColorStop(1, 'transparent');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, width, height);
    
    // Círculo 2 - Inferior derecha
    const grad2 = ctx.createRadialGradient(width * 0.8, height * 0.7, 0, width * 0.8, height * 0.7, 250);
    grad2.addColorStop(0, '#EB459E');
    grad2.addColorStop(1, 'transparent');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, width, height);
    
    ctx.restore();
}

// ✨ NUEVO: Panel con glassmorphism
function drawGlassmorphicPanel(ctx, x, y, width, height, blur = false) {
    ctx.save();
    
    // Sombra del panel
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 20;
    
    // Fondo del panel
    ctx.fillStyle = blur ? 'rgba(255, 255, 255, 0.08)' : 'rgba(20, 20, 30, 0.7)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 24);
    ctx.fill();
    
    // Borde con gradiente
    const borderGradient = ctx.createLinearGradient(x, y, x + width, y + height);
    borderGradient.addColorStop(0, 'rgba(88, 101, 242, 0.5)');
    borderGradient.addColorStop(0.5, 'rgba(235, 69, 158, 0.5)');
    borderGradient.addColorStop(1, 'rgba(237, 66, 69, 0.5)');
    
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();
}

async function generateWelcomeImage({ 
    bgColor, 
    image, 
    textColor, 
    fontSize, 
    message,
    user,
    guild,
    showAvatar = true,  // ✨ NUEVO: Opción para mostrar/ocultar avatar
    enableBlur = false   // ✨ NUEVO: Opción para aplicar blur
}) {
    const width = 1400;
    const height = 500;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // ====== FONDO ======
    
    if (!bgColor && !image) {
        drawModernBackground(ctx, width, height);
    }
    
    if (bgColor && isColor(bgColor)) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
    }

    if (image) {
        try {
            const bgImage = await loadImage("." + image);
            ctx.drawImage(bgImage, 0, 0, width, height);
            
            // Aplicar blur si está habilitado
            if (enableBlur) {
                applyGaussianBlur(ctx, width, height, 8);
            }
            
            // Overlay para mejorar legibilidad
            ctx.fillStyle = enableBlur ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(0, 0, width, height);
        } catch (err) {
            console.error("Error cargando imagen de fondo:", err);
            drawModernBackground(ctx, width, height);
        }
    }

    // ====== BARRA DECORATIVA SUPERIOR CON GRADIENTE ======
    const topBarHeight = 5;
    const topGradient = ctx.createLinearGradient(0, 0, width, 0);
    topGradient.addColorStop(0, '#5865F2');
    topGradient.addColorStop(0.33, '#EB459E');
    topGradient.addColorStop(0.66, '#ED4245');
    topGradient.addColorStop(1, '#FEE75C');
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, width, topBarHeight);

    // ====== PANEL CENTRAL CON GLASSMORPHISM ======
    const panelWidth = 1100;
    const panelHeight = 280;
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;
    
    drawGlassmorphicPanel(ctx, panelX, panelY, panelWidth, panelHeight, enableBlur);

    // ====== AVATAR DEL USUARIO ======
    
    let avatarSize = 0;
    let avatarX = 0;
    let textStartX = panelX + 60;
    
    if (showAvatar && user) {
        avatarSize = 160;
        avatarX = panelX + 140;
        const avatarY = height / 2;
        
        const avatarUrl = user.avatar 
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`;
        
        await drawAvatar(ctx, avatarUrl, avatarX, avatarY, avatarSize);
        
        textStartX = avatarX + avatarSize / 2 + 80;
    }

    // ====== TEXTO CON FUENTE ROBUSTA (WHITNEY/DISCORD-STYLE) ======
    
    let realFontSize = Number(fontSize);
    if (isNaN(realFontSize) || realFontSize < 40) realFontSize = 40;
    if (realFontSize > 100) realFontSize = 100;

    // Fuente estilo Discord (Whitney similar)
    ctx.font = `800 ${realFontSize}px "Arial Black", "Helvetica Neue", "Segoe UI", sans-serif`;
    ctx.fillStyle = textColor || "#ffffff";
    ctx.textBaseline = "middle";

    const textMaxWidth = panelX + panelWidth - textStartX - 60;
    const lines = wrapText(ctx, message, textMaxWidth);
    
    const lineHeight = realFontSize * 1.3;
    const totalTextHeight = lines.length * lineHeight;
    const textStartY = (height - totalTextHeight) / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
        const y = textStartY + i * lineHeight;
        
        // Sombra múltiple para efecto de profundidad
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;
        
        const lineWidth = ctx.measureText(lines[i]).width;
        const x = textStartX + (textMaxWidth - lineWidth) / 2;
        
        ctx.textAlign = 'left';
        await drawTextWithEmojis(ctx, lines[i], x, y, realFontSize, textMaxWidth);
        
        clearTextShadow(ctx);
    }

    // ====== SUBTÍTULO CON ÍCONO ======
    
    if (guild) {
        const subtitleFontSize = realFontSize * 0.35;
        ctx.font = `600 ${subtitleFontSize}px "Arial", "Segoe UI", sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.textAlign = 'center';
        
        addTextShadow(ctx, 'rgba(0, 0, 0, 0.7)', 8, 0, 3);
        
        const subtitleY = textStartY + lines.length * lineHeight + 40;
        const subtitleX = textStartX + textMaxWidth / 2;
        
        if (subtitleY < height - 60) {
            // Dibujar ícono de servidor (punto decorativo)
            ctx.fillStyle = '#5865F2';
            ctx.beginPath();
            ctx.arc(subtitleX - ctx.measureText(guild.name).width / 2 - 20, subtitleY, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillText(guild.name, subtitleX, subtitleY);
            
            ctx.beginPath();
            ctx.arc(subtitleX + ctx.measureText(guild.name).width / 2 + 20, subtitleY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        
        clearTextShadow(ctx);
    }

    // ====== BADGE/INSIGNIA "NUEVO MIEMBRO" ======
    const badgeWidth = 160;
    const badgeHeight = 36;
    const badgeX = width - 60 - badgeWidth;
    const badgeY = 60;
    
    // Fondo del badge
    const badgeGradient = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeWidth, badgeY + badgeHeight);
    badgeGradient.addColorStop(0, 'rgba(88, 101, 242, 0.9)');
    badgeGradient.addColorStop(1, 'rgba(235, 69, 158, 0.9)');
    
    ctx.fillStyle = badgeGradient;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 18);
    ctx.fill();
    
    // Texto del badge
    ctx.font = `700 14px "Arial", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NUEVO MIEMBRO', badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);

    // ====== GUARDAR IMAGEN ======
    
    const finalName = `/uploads/welcome_${Date.now()}.png`;
    const outputPath = path.join(process.cwd(), "." + finalName);
    
    const uploadDir = path.join(process.cwd(), "./uploads");
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
    
    return finalName;
}

export { generateWelcomeImage, parsePlaceholders };