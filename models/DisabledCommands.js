import mongoose from 'mongoose';

const disabledCommandsSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true
    },
    disabledCommands: {
        type: [String],
        default: []
    },
    disabledBy: {
        type: Map,
        of: {
            userId: String,
            timestamp: Date,
            reason: String
        },
        default: new Map()
    }
}, { timestamps: true });

export default mongoose.model('DisabledCommands', disabledCommandsSchema);