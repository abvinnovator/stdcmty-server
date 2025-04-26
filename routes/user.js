import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

import dotenv from 'dotenv';
import { User } from "../models/User.js";

dotenv.config();
const router = express.Router();

// Middleware to verify user
const verifyUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ status: false, message: "No token provided" });
    }
    
    const decoded = await jwt.verify(token, process.env.KEY);
    if (!decoded || !decoded._id) {
      return res.status(401).json({ status: false, message: "Invalid token" });
    }

    // Get the full user object from database
    const user = await User.findById(decoded._id);
    if (!user) {
      return res.status(401).json({ status: false, message: "User not found" });
    }

    // Attach the full user object to the request
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ status: false, message: "Authentication failed" });
  }
};

// Get user profile
router.get('/userprofile', verifyUser, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, '-password');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving user profile" });
  }
});

router.post("/signup", async (req, res) => {
  const { username, email, password, currentBranch, gender, yearOfStudy, areasOfInterest, skills, profileTheme } = req.body;
  
  try {
    console.log("Signup attempt for:", email); // Log the attempt
    
    const user = await User.findOne({ email });
    if (user) {
      console.log("User already exists:", email);
      return res.status(400).json({ status: false, message: "User already exists" });
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashPassword,
      currentBranch,
      gender,
      yearOfStudy,
      areasOfInterest,
      skills,
      profileTheme
    });

    // Validate before saving
    await newUser.validate();
    
    await newUser.save();
    console.log("User registered successfully:", email);
    return res.json({ status: true, message: "User registered successfully" });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ 
      status: false, 
      message: "Error registering user",
      error: error.message // Include the error message
    });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: "user is not registered" });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ message: "password is incorrect" });
  }

  const token = jwt.sign(
    { 
      username: user.username,
      _id: user._id,
      email: user.email
    }, 
    process.env.KEY, 
    {
      expiresIn: "48h",
    }
  );

  return res.json({ 
    status: true, 
    message: "login successfully", 
    token: token,
    user: {
      _id: user._id,
      username: user.username,
      email: user.email
    }
  });
});
// Update user profile
router.put('/userprofile', verifyUser, async (req, res) => {
  try {
    const { username, email, currentBranch, areasOfInterest, yearOfStudy, skills, gender } = req.body;
    const updatedUser = await User.findOneAndUpdate(
      { username: req.user.username },
      { username, email, currentBranch, areasOfInterest, yearOfStudy, skills, gender },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: "Error updating user profile" });
  }
});
//SEO

router.get('/search', verifyUser, async (req, res) => {
  const { username } = req.query;
  try {
    const users = await User.find({ username: { $regex: username, $options: 'i' } }, '-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error searching for users" });
  }
});
// to view Users profiles
router.get('/profiles', async (req, res) => {
  const { username } = req.query;
  try {
    if (username) {
      const user = await User.findOne({ username }, '-password');
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } else {
      const users = await User.find({}, '-password');
      res.json(users);
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Add friend route
router.post('/addfriend', verifyUser, async (req, res) => {
  const { friendUsername } = req.body;

  try {
    const user = await User.findOne({ username: req.user.username });
    const friend = await User.findOne({ username: friendUsername });

    if (!friend) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.friends.includes(friend._id)) {
      return res.status(400).json({ message: 'User is already a friend' });
    }

    user.friends.push(friend._id);
    friend.friends.push(user._id);

    await user.save();
    await friend.save();

    res.json({ message: 'Friend added successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error adding friend', error: err.message });
  }
});

// Get friend list route
router.get('/friends', verifyUser, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }).populate('friends', '-password');
    res.json(user.friends);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving friends', error: err.message });
  }
});


router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: "user not registered" });
    }
    const token = jwt.sign({ id: user._id }, process.env.KEY, {
      expiresIn: "5m",
    });

    var transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    const encodedToken = encodeURIComponent(token).replace(/\./g, "%2E");
    var mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Reset Password",
      text: `http://localhost:5173/resetPassword/${encodedToken}`,
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        return res.json({ message: "error sending email" });
      } else {
        return res.json({ status: true, message: "email sent" });
      }
    });
  } catch (err) {
    console.log(err);
  }
});

router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  try {
    const decoded = await jwt.verify(token, process.env.KEY);
    const id = decoded.id;
    const hashPassword = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate({ _id: id }, { password: hashPassword });
    return res.json({ status: true, message: "updated password" });
  } catch (err) {
    return res.json("invalid token");
  }
});

router.get("/verify", verifyUser, (req, res) => {
  return res.json({ status: true, message: "authorized" });
});

router.get('/logout', (req, res) => {
  return res.json({ status: true, message: "Logged out successfully" });
});
export {verifyUser};
export { router as UserRouter };