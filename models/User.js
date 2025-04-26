import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    currentBranch: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    yearOfStudy: { type: Number, required: true },
    areasOfInterest: [{ type: String }],
    skills: [{ type: String }],
    profileTheme:{type:String,required:true},
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] 
   
});

const UserModel = mongoose.model("User", UserSchema);

export { UserModel as User };
