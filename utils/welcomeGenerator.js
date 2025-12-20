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

// ✨ Aplicar efecto blur mejorado usando StackBlur
function applyStackBlur(canvas, radius) {
    if (radius <= 0) return;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    stackBlurImageData(imageData, 0, 0, canvas.width, canvas.height, radius);
    
    ctx.putImageData(imageData, 0, 0);
}

function stackBlurImageData(imageData, top_x, top_y, width, height, radius) {
    const pixels = imageData.data;
    let x, y, i, p, yp, yi, yw, r_sum, g_sum, b_sum, a_sum, 
        r_out_sum, g_out_sum, b_out_sum, a_out_sum,
        r_in_sum, g_in_sum, b_in_sum, a_in_sum, 
        pr, pg, pb, pa, rbs;
    
    const div = radius + radius + 1;
    const widthMinus1  = width - 1;
    const heightMinus1 = height - 1;
    const radiusPlus1  = radius + 1;
    const sumFactor = radiusPlus1 * (radiusPlus1 + 1) / 2;
    
    const stackStart = {r:0, g:0, b:0, a:0, next:null};
    let stack = stackStart;
    let stackEnd;
    for (i = 1; i < div; i++) {
        stack = stack.next = {r:0, g:0, b:0, a:0, next:null};
        if (i == radiusPlus1) stackEnd = stack;
    }
    stack.next = stackStart;
    
    yw = yi = 0;
    
    const mul_sum = [512,512,456,512,328,456,335,512,405,328,271,456,388,335,292,512,454,405,364,328,298,271,496,456,420,388,360,335,312,292,273,512,482,454,428,405,383,364,345,328,312,298,284,271,259,496,475,456,437,420,404,388,374,360,347,335,323,312,302,292,282,273,265,512,497,482,468,454,441,428,417,405,394,383,373,364,354,345,337,328,320,312,305,298,291,284,278,271,265,259,507,496,485,475,465,456,446,437,428,420,412,404,396,388,381,374,367,360,354,347,341,335,329,323,318,312,307,302,297,292,287,282,278,273,269,265,261,512,505,497,489,482,475,468,461,454,447,441,435,428,422,417,411,405,399,394,389,383,378,373,368,364,359,354,350,345,341,337,332,328,324,320,316,312,309,305,301,298,294,291,287,284,281,278,274,271,268,265,262,259,257,507,501,496,491,485,480,475,470,465,460,456,451,446,442,437,433,428,424,420,416,412,408,404,400,396,392,388,385,381,377,374,370,367,363,360,357,354,350,347,344,341,338,335,332,329,326,323,320,318,315,312,310,307,304,302,299,297,294,292,289,287,285,282,280,278,275,273,271,269,267,265,263,261,259];
   
    const shg_sum = [9,11,12,13,13,14,14,15,15,15,15,16,16,16,16,17,17,17,17,17,17,17,18,18,18,18,18,18,18,18,18,19,19,19,19,19,19,19,19,19,19,19,19,19,19,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24];
    
    for (y = 0; y < height; y++) {
        r_in_sum = g_in_sum = b_in_sum = a_in_sum = r_sum = g_sum = b_sum = a_sum = 0;
        
        r_out_sum = radiusPlus1 * (pr = pixels[yi]);
        g_out_sum = radiusPlus1 * (pg = pixels[yi+1]);
        b_out_sum = radiusPlus1 * (pb = pixels[yi+2]);
        a_out_sum = radiusPlus1 * (pa = pixels[yi+3]);
        
        r_sum += sumFactor * pr;
        g_sum += sumFactor * pg;
        b_sum += sumFactor * pb;
        a_sum += sumFactor * pa;
        
        stack = stackStart;
        
        for(i = 0; i < radiusPlus1; i++) {
            stack.r = pr;
            stack.g = pg;
            stack.b = pb;
            stack.a = pa;
            stack = stack.next;
        }
        
        for(i = 1; i < radiusPlus1; i++) {
            p = yi + ((widthMinus1 < i ? widthMinus1 : i) << 2);
            r_sum += (stack.r = (pr = pixels[p])) * (rbs = radiusPlus1 - i);
            g_sum += (stack.g = (pg = pixels[p+1])) * rbs;
            b_sum += (stack.b = (pb = pixels[p+2])) * rbs;
            a_sum += (stack.a = (pa = pixels[p+3])) * rbs;
            
            r_in_sum += pr;
            g_in_sum += pg;
            b_in_sum += pb;
            a_in_sum += pa;
            
            stack = stack.next;
        }
        
        for (x = 0; x < width; x++) {
            pixels[yi+3] = pa = (a_sum * mul_sum[radius]) >> shg_sum[radius];
            if (pa != 0) {
                pa = 255 / pa;
                pixels[yi]   = ((r_sum * mul_sum[radius]) >> shg_sum[radius]) * pa;
                pixels[yi+1] = ((g_sum * mul_sum[radius]) >> shg_sum[radius]) * pa;
                pixels[yi+2] = ((b_sum * mul_sum[radius]) >> shg_sum[radius]) * pa;
            } else {
                pixels[yi] = pixels[yi+1] = pixels[yi+2] = 0;
            }
            
            r_sum -= r_out_sum;
            g_sum -= g_out_sum;
            b_sum -= b_out_sum;
            a_sum -= a_out_sum;
            
            r_out_sum -= stackStart.r;
            g_out_sum -= stackStart.g;
            b_out_sum -= stackStart.b;
            a_out_sum -= stackStart.a;
            
            p = (yw + ((p = x + radius + 1) < widthMinus1 ? p : widthMinus1)) << 2;
            
            r_in_sum += (stackStart.r = pixels[p]);
            g_in_sum += (stackStart.g = pixels[p+1]);
            b_in_sum += (stackStart.b = pixels[p+2]);
            a_in_sum += (stackStart.a = pixels[p+3]);
            
            r_sum += r_in_sum;
            g_sum += g_in_sum;
            b_sum += b_in_sum;
            a_sum += a_in_sum;
            
            stackStart = stackStart.next;
            
            r_out_sum += (pr = stackStart.r);
            g_out_sum += (pg = stackStart.g);
            b_out_sum += (pb = stackStart.b);
            a_out_sum += (pa = stackStart.a);
            
            r_in_sum -= pr;
            g_in_sum -= pg;
            b_in_sum -= pb;
            a_in_sum -= pa;
            
            yi += 4;
        }
        yw += width;
    }
    
    for (x = 0; x < width; x++) {
        g_in_sum = b_in_sum = a_in_sum = r_in_sum = g_sum = b_sum = a_sum = r_sum = 0;
        
        yi = x << 2;
        r_out_sum = radiusPlus1 * (pr = pixels[yi]);
        g_out_sum = radiusPlus1 * (pg = pixels[yi+1]);
        b_out_sum = radiusPlus1 * (pb = pixels[yi+2]);
        a_out_sum = radiusPlus1 * (pa = pixels[yi+3]);
        
        r_sum += sumFactor * pr;
        g_sum += sumFactor * pg;
        b_sum += sumFactor * pb;
        a_sum += sumFactor * pa;
        
        stack = stackStart;
        
        for(i = 0; i < radiusPlus1; i++) {
            stack.r = pr;
            stack.g = pg;
            stack.b = pb;
            stack.a = pa;
            stack = stack.next;
        }
        
        yp = width;
        
        for(i = 1; i < radiusPlus1; i++) {
            yi = (yp + x) << 2;
            
            r_sum += (stack.r = (pr = pixels[yi])) * (rbs = radiusPlus1 - i);
            g_sum += (stack.g = (pg = pixels[yi+1])) * rbs;
            b_sum += (stack.b = (pb = pixels[yi+2])) * rbs;
            a_sum += (stack.a = (pa = pixels[yi+3])) * rbs;
           
            r_in_sum += pr;
            g_in_sum += pg;
            b_in_sum += pb;
            a_in_sum += pa;
            
            stack = stack.next;
        
            if(i < heightMinus1) {
                yp += width;
            }
        }
        
        yi = x;
        for (y = 0; y < height; y++) {
            p = yi << 2;
            pixels[p+3] = pa = (a_sum * mul_sum[radius]) >> shg_sum[radius];
            if (pa > 0) {
                pa = 255 / pa;
                pixels[p]   = ((r_sum * mul_sum[radius]) >> shg_sum[radius]) * pa;
                pixels[p+1] = ((g_sum * mul_sum[radius]) >> shg_sum[radius]) * pa;
                pixels[p+2] = ((b_sum * mul_sum[radius]) >> shg_sum[radius]) * pa;
            } else {
                pixels[p] = pixels[p+1] = pixels[p+2] = 0;
            }
            
            r_sum -= r_out_sum;
            g_sum -= g_out_sum;
            b_sum -= b_out_sum;
            a_sum -= a_out_sum;
           
            r_out_sum -= stackStart.r;
            g_out_sum -= stackStart.g;
            b_out_sum -= stackStart.b;
            a_out_sum -= stackStart.a;
            
            p = (x + (((p = y + radiusPlus1) < heightMinus1 ? p : heightMinus1) * width)) << 2;
            
            r_sum += (r_in_sum += (stackStart.r = pixels[p]));
            g_sum += (g_in_sum += (stackStart.g = pixels[p+1]));
            b_sum += (b_in_sum += (stackStart.b = pixels[p+2]));
            a_sum += (a_in_sum += (stackStart.a = pixels[p+3]));
           
            stackStart = stackStart.next;
            
            r_out_sum += (pr = stackStart.r);
            g_out_sum += (pg = stackStart.g);
            b_out_sum += (pb = stackStart.b);
            a_out_sum += (pa = stackStart.a);
            
            r_in_sum -= pr;
            g_in_sum -= pg;
            b_in_sum -= pb;
            a_in_sum -= pa;
            
            yi += width;
        }
    }
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
        
        // Borde blanco limpio
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.stroke();
        
        // Sombra exterior
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;
        
        ctx.beginPath();
        ctx.arc(x, y, size / 2 + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        
        return true;
    } catch (err) {
        console.error("Error cargando avatar:", err);
        return false;
    }
}

function drawModernBackground(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f0f1e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

async function generateWelcomeImage({ 
    bgColor, 
    image, 
    textColor, 
    fontSize, 
    message,
    user,
    guild,
    showAvatar = true,
    enableBlur = false
}) {
    const width = 1200;  // Reducido de 1400 a 1200
    const height = 450;   // Reducido de 500 a 450

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
                applyStackBlur(canvas, 12);
            }
            
            // Overlay para mejorar legibilidad
            ctx.fillStyle = enableBlur ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.45)';
            ctx.fillRect(0, 0, width, height);
        } catch (err) {
            console.error("Error cargando imagen de fondo:", err);
            drawModernBackground(ctx, width, height);
        }
    }

    // ====== BORDES REDONDEADOS OSCUROS ======
    const cornerRadius = 20;
    
    // Sombras en las esquinas para efecto de profundidad
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    
    // Esquina superior izquierda
    const gradTL = ctx.createRadialGradient(0, 0, 0, 0, 0, cornerRadius * 3);
    gradTL.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    gradTL.addColorStop(1, 'transparent');
    ctx.fillStyle = gradTL;
    ctx.fillRect(0, 0, cornerRadius * 3, cornerRadius * 3);
    
    // Esquina superior derecha
    const gradTR = ctx.createRadialGradient(width, 0, 0, width, 0, cornerRadius * 3);
    gradTR.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    gradTR.addColorStop(1, 'transparent');
    ctx.fillStyle = gradTR;
    ctx.fillRect(width - cornerRadius * 3, 0, cornerRadius * 3, cornerRadius * 3);
    
    // Esquina inferior izquierda
    const gradBL = ctx.createRadialGradient(0, height, 0, 0, height, cornerRadius * 3);
    gradBL.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    gradBL.addColorStop(1, 'transparent');
    ctx.fillStyle = gradBL;
    ctx.fillRect(0, height - cornerRadius * 3, cornerRadius * 3, cornerRadius * 3);
    
    // Esquina inferior derecha
    const gradBR = ctx.createRadialGradient(width, height, 0, width, height, cornerRadius * 3);
    gradBR.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    gradBR.addColorStop(1, 'transparent');
    ctx.fillStyle = gradBR;
    ctx.fillRect(width - cornerRadius * 3, height - cornerRadius * 3, cornerRadius * 3, cornerRadius * 3);
    
    ctx.restore();

    // ====== AVATAR DEL USUARIO ======
    
    let avatarSize = 0;
    let avatarX = 0;
    let textStartX = 60;
    
    if (showAvatar && user) {
        avatarSize = 140;
        avatarX = 110;
        const avatarY = height / 2;
        
        const avatarUrl = user.avatar 
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`;
        
        await drawAvatar(ctx, avatarUrl, avatarX, avatarY, avatarSize);
        
        textStartX = avatarX + avatarSize / 2 + 70;
    }

    // ====== TEXTO CON FUENTE ROBUSTA ======
    
    let realFontSize = Number(fontSize);
    if (isNaN(realFontSize) || realFontSize < 40) realFontSize = 40;
    if (realFontSize > 100) realFontSize = 100;

    ctx.font = `800 ${realFontSize}px "Arial Black", "Helvetica Neue", "Segoe UI", sans-serif`;
    ctx.fillStyle = textColor || "#ffffff";
    ctx.textBaseline = "middle";

    const textMaxWidth = width - textStartX - 60;
    const lines = wrapText(ctx, message, textMaxWidth);
    
    const lineHeight = realFontSize * 1.3;
    const totalTextHeight = lines.length * lineHeight;
    const textStartY = (height - totalTextHeight) / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
        const y = textStartY + i * lineHeight;
        
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

    // ====== SUBTÍTULO ======
    
    if (guild) {
        const subtitleFontSize = realFontSize * 0.35;
        ctx.font = `600 ${subtitleFontSize}px "Arial", "Segoe UI", sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.textAlign = 'center';
        
        addTextShadow(ctx, 'rgba(0, 0, 0, 0.7)', 8, 0, 3);
        
        const subtitleY = textStartY + lines.length * lineHeight + 35;
        const subtitleX = textStartX + textMaxWidth / 2;
        
        if (subtitleY < height - 50) {
            ctx.fillText(`Bienvenido a ${guild.name}`, subtitleX, subtitleY);
        }
        
        clearTextShadow(ctx);
    }

    // ====== BADGE "NUEVO MIEMBRO" ======
    const badgeWidth = 140;
    const badgeHeight = 32;
    const badgeX = width - 50 - badgeWidth;
    const badgeY = 50;
    
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 16);
    ctx.fill();
    
    ctx.font = `700 13px "Arial", sans-serif`;
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