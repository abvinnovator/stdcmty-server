import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { UserRouter } from './routes/user.js';
import { ChatRouter } from './routes/chat.js';
import http from 'http';
import { Server } from 'socket.io';
import { Chat } from './models/Chat.js';
import { PostRouter } from './routes/post.js';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();

// CORS configuration
const corsOptions = {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"]
};

// Middleware
app.use(express.json());
app.use(cors(corsOptions));
app.use(cookieParser());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/auth', UserRouter);
app.use('/api/post', PostRouter);
app.use('/api/chats', ChatRouter);

// Database connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');

        // Create HTTP server
        const server = http.createServer(app);

        // Initialize Socket.IO with updated CORS
        const io = new Server(server, {
            cors: {
                origin: ["http://localhost:5173", "http://localhost:5174"],
                methods: ["GET", "POST"],
                credentials: true,
                allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
            }
        });

        // Middleware for socket authentication
        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) {
                console.error('Socket auth error: No token provided');
                return next(new Error('Authentication error'));
            }

            try {
                // Log the token format for debugging
                console.log('Received token format:', token.substring(0, 10) + '...');
                
                // Verify the token using the correct secret key (KEY instead of JWT_SECRET)
                const decoded = jwt.verify(token, process.env.KEY);
                
                // Check for required user data
                if (!decoded || !decoded._id) {
                    console.error('Socket auth error: Invalid token payload', decoded);
                    return next(new Error('Authentication error'));
                }

                // Set user data on socket
                socket.user = {
                    id: decoded._id,
                    username: decoded.username
                };
                console.log('Socket authenticated for user:', socket.user.username);
                next();
            } catch (err) {
                console.error('Socket auth error:', err.message);
                console.error('Token that caused error:', token.substring(0, 10) + '...');
                next(new Error('Authentication error'));
            }
        });

        // Store active users
        const activeUsers = new Map();

        // Socket.IO connection event
        io.on('connection', (socket) => {
            console.log('A user connected:', socket.id, 'User:', socket.user.username);

            // Store user's socket ID
            activeUsers.set(socket.user.id, socket.id);

            // Emit active users to all connected clients
            io.emit('activeUsers', Array.from(activeUsers.keys()));

            // Join user's personal room
            socket.join(socket.user.id);

            // Join a chat room
            socket.on('join_chat', ({ chatId }) => {
                socket.join(chatId);
                console.log(`User ${socket.user.username} joined chat ${chatId}`);
            });

            // Handle sending messages
            socket.on('sendMessage', async ({ chatId, content }) => {
                try {
                    const chat = await Chat.findById(chatId);
                    if (chat) {
                        const message = {
                            sender: socket.user.id,
                            content,
                            timestamp: new Date()
                        };
                        chat.messages.push(message);
                        await chat.save();

                        // Emit to all users in the chat room, including the sender
                        const messageToEmit = {
                            chatId,
                            message: {
                                content: message.content,
                                sender: {
                                    _id: socket.user.id,
                                    username: socket.user.username
                                },
                                timestamp: message.timestamp
                            }
                        };

                        // Emit to all users in the chat room
                        io.to(chatId).emit('message', messageToEmit);

                        // Update last message preview for all participants
                        chat.participants.forEach(participantId => {
                            if (participantId.toString() !== socket.user.id) {
                                io.to(participantId.toString()).emit('chatUpdate', {
                                    chatId,
                                    lastMessage: content,
                                    timestamp: message.timestamp
                                });
                            }
                        });
                    }
                } catch (error) {
                    console.error("Error sending message:", error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Handle typing status
            socket.on('typing', ({ chatId, isTyping }) => {
                socket.to(chatId).emit('typing', {
                    chatId,
                    userId: socket.user.id,
                    isTyping
                });
            });

            // Handle read receipts
            socket.on('markAsRead', async ({ chatId }) => {
                try {
                    const chat = await Chat.findById(chatId);
                    if (chat) {
                        chat.messages.forEach(message => {
                            if (!message.readBy.includes(socket.user.id)) {
                                message.readBy.push(socket.user.id);
                            }
                        });
                        await chat.save();

                        // Notify other participants
                        socket.to(chatId).emit('messagesRead', {
                            chatId,
                            userId: socket.user.id
                        });
                    }
                } catch (error) {
                    console.error("Error marking messages as read:", error);
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log('User disconnected:', socket.id, 'User:', socket.user.username);
                activeUsers.delete(socket.user.id);
                io.emit('activeUsers', Array.from(activeUsers.keys()));
            });
        });

        // Start the server with error handling
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${PORT} is already in use.`);
            } else {
                console.error('Error starting server:', err);
            }
        });
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error);
    });
