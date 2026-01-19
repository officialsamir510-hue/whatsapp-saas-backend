const mongoose = require("mongoose");
require("dotenv").config();

async function dropIndex() {
    try {
        const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/test";
        await mongoose.connect(uri);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        const collection = db.collection("tenants");

        try {
            await collection.dropIndex("email_1");
            console.log("Dropped email_1 index");
        } catch (err) {
            console.log("email_1 index not found");
        }

        console.log("Done!");
        process.exit(0);
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

dropIndex();
