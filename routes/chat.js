import express from 'express';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js'; // Import Message model
import { verifyUser } from './user.js';

const router = express.Router();

// Create or get an individual chat between two users
router.post('/create', verifyUser, async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ 
                success: false,
                message: "User not authenticated" 
            });
        }

        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ 
                success: false,
                message: "User ID is required" 
            });
        }

        const currentUserId = req.user._id.toString();
        
        // Check if chat already exists
        let chat = await Chat.findOne({
            chatType: 'individual',
            participants: { $all: [currentUserId, userId] }
        }).populate('participants', 'username profilePicture');

        if (!chat) {
            chat = new Chat({
                chatType: 'individual',
                participants: [currentUserId, userId],
                messages: []
            });
            await chat.save();
            chat = await chat.populate('participants', 'username profilePicture');
        }

        res.status(201).json({
            success: true,
            chat,
            message: 'Chat created successfully'
        });
    } catch (error) {
        console.error('Chat creation error:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
});

// Create a group chat
router.post('/create-group', verifyUser, async (req, res) => {
    const { groupName, participants } = req.body;
    const currentUserId = req.user._id;

    try {
        const chat = new Chat({
            chatType: 'group',
            groupName,
            participants: [...participants, currentUserId],
            groupAdmin: currentUserId,
            messages: []
        });
        await chat.save();
        const populatedChat = await chat.populate('participants', 'username profilePicture');
        res.status(201).json(populatedChat);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all chats for a user
router.get('/user-chats', verifyUser, async (req, res) => {
    try {
        const chats = await Chat.find({
            participants: req.user._id
        })
        .populate('participants', 'username profilePicture')
        .populate('messages.sender', 'username profilePicture')
        .sort({ lastUpdated: -1 });

        res.status(200).json(chats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get specific chat by ID
router.get('/:chatId', verifyUser, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId)
            .populate('participants', 'username profilePicture')
            .populate('messages.sender', 'username profilePicture');

        if (!chat) {
            return res.status(404).json({ error: "Chat not found" });
        }

        // Check if user is a participant
        if (!chat.participants.some(p => p._id.toString() === req.user._id.toString())) {
            return res.status(403).json({ error: "Access denied" });
        }

        res.status(200).json(chat);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add participants to group chat
router.post('/:chatId/add-participants', verifyUser, async (req, res) => {
    const { participants } = req.body;
    try {
        const chat = await Chat.findById(req.params.chatId);
        
        if (!chat) {
            return res.status(404).json({ error: "Chat not found" });
        }

        if (chat.chatType !== 'group') {
            return res.status(400).json({ error: "Can only add participants to group chats" });
        }

        if (chat.groupAdmin.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Only admin can add participants" });
        }

        chat.participants = [...new Set([...chat.participants, ...participants])];
        await chat.save();
        
        const updatedChat = await chat.populate('participants', 'username profilePicture');
        res.status(200).json(updatedChat);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mark messages as read
router.post('/:chatId/mark-read', verifyUser, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);
        
        if (!chat) {
            return res.status(404).json({ error: "Chat not found" });
        }

        chat.messages.forEach(message => {
            if (!message.readBy.includes(req.user._id)) {
                message.readBy.push(req.user._id);
            }
        });

        await chat.save();
        res.status(200).json({ message: "Messages marked as read" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export { router as ChatRouter };
