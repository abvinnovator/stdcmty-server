import express from "express";
import { Post } from "../models/Post.js";
import { verifyUser } from './user.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Make sure this folder exists
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage });

// Create post with image
router.post("/createposts", verifyUser, upload.single('image'), async (req, res) => {
    try {
        const { title, desc } = req.body;
        const imgUrl = req.file ? `/uploads/${req.file.filename}` : '';
        
        const post = new Post({
            imgUrl,
            title,
            desc,
            username: req.user.username,
            createdAt: new Date()
        });
        
        await post.save();
        res.status(201).json({ status: true, message: "Post created successfully", post });
    } catch (error) {
        res.status(500).json({ status: false, message: "Failed to create post", error: error.message });
    }
});

// Get all posts
router.get("/getposts", async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 });
        res.status(200).json({ status: true, posts });
    } catch (error) {
        res.status(500).json({ status: false, message: "Failed to retrieve posts", error: error.message });
    }
});

// Delete post (only by author)
router.delete('/deletepost/:id', verifyUser, async (req, res) => {
    try {
        const postId = req.params.id;
        const user = req.user;

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ status: false, message: 'Post not found' });
        }

        if (post.username !== user.username) {
            return res.status(403).json({ status: false, message: 'Unauthorized to delete this post' });
        }

        await Post.findByIdAndDelete(postId);
        res.status(200).json({ status: true, message: 'Post deleted successfully' });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Failed to delete post', error: error.message });
    }
});

// Like/Unlike post
router.post('/like/:id', verifyUser, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ status: false, message: 'Post not found' });
        }

        const likeIndex = post.likes.indexOf(req.user.username);
        if (likeIndex === -1) {
            post.likes.push(req.user.username);
        } else {
            post.likes.splice(likeIndex, 1);
        }

        await post.save();
        res.status(200).json({ status: true, likes: post.likes });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Failed to update like', error: error.message });
    }
});

// Add comment to post
router.post('/comment/:id', verifyUser, async (req, res) => {
    try {
        const { text } = req.body;
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ status: false, message: 'Post not found' });
        }

        post.comments.push({
            username: req.user.username,
            text,
            createdAt: new Date()
        });

        await post.save();
        res.status(200).json({ status: true, comments: post.comments });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Failed to add comment', error: error.message });
    }
});

export { router as PostRouter };
