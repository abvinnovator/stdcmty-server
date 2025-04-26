const Chat = require('../models/Chat');
const User = require('../models/User');

// Create a new chat
exports.createChat = async (req, res) => {
    try {
        const { userId } = req.body;
        const currentUserId = req.user._id;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Check if chat already exists
        let chat = await Chat.findOne({
            participants: { $all: [currentUserId, userId] },
            isGroupChat: false
        }).populate('participants', 'username email profilePicture');

        if (chat) {
            return res.json({
                success: true,
                chat,
                message: 'Chat already exists'
            });
        }

        // Create new chat
        chat = await Chat.create({
            participants: [currentUserId, userId],
            isGroupChat: false
        });

        // Populate chat details
        chat = await Chat.findById(chat._id)
            .populate('participants', 'username email profilePicture')
            .populate('lastMessage');

        res.status(201).json({
            success: true,
            chat,
            message: 'Chat created successfully'
        });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating chat',
            error: error.message
        });
    }
};

// Get chat details
exports.getChatDetails = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user._id;

        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Chat ID is required'
            });
        }

        console.log('Fetching chat details for chatId:', chatId);
        const chat = await Chat.findById(chatId)
            .populate('participants', 'username email profilePicture')
            .populate('messages.sender', 'username email profilePicture')
            .populate('lastMessage');

        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        // Check if user is a participant
        if (!chat.participants.some(p => p._id.toString() === userId.toString())) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this chat'
            });
        }

        res.json({
            success: true,
            chat
        });
    } catch (error) {
        console.error('Get chat details error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching chat details',
            error: error.message
        });
    }
}; 