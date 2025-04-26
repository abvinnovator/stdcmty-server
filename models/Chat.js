import mongoose from "mongoose";
const { Schema } = mongoose;

const MessageSchema = new Schema({
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }]
});

const ChatSchema = new Schema({
    chatType: { 
        type: String, 
        enum: ['individual', 'group'],
        required: true 
    },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    groupName: { type: String },
    groupAdmin: { type: Schema.Types.ObjectId, ref: 'User' },
    messages: [MessageSchema],
    lastUpdated: { type: Date, default: Date.now }
});

ChatSchema.pre('save', function (next) {
    this.lastUpdated = Date.now();
    next();
});

const ChatModel = mongoose.model("Chat", ChatSchema);

export { ChatModel as Chat };
