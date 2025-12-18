const express = require("express");
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zazcspq.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

app.get('/', (req, res) => {
    res.send("Scholarship server is available");
});

async function run() {
    try {
        await client.connect();
        const db = client.db("scholarshipDB");
        const usersCollection = db.collection("users");
        const scholarshipsCollection = db.collection("scholarships");

        app.post("/users", async (req, res) => {
            try {
                const { name, email, photoURL, createdAt } = req.body;

                const user = {
                    name,
                    email,
                    photoURL,
                    role: "student",
                    createdAt: createdAt ? new Date(createdAt) : new Date()
                };

                const result = await usersCollection.insertOne(user);
                res.send(result);
            } catch (error) {
                console.error("Failed to create user", error);
                res.status(500).send({ message: "Failed to create user." });
            }
        });

        app.get("/users", async (req, res) => {
            try {
                const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
                res.send(users);
            } catch (error) {
                console.error("Failed to fetch users", error);
                res.status(500).send({ message: "Failed to fetch users." });
            }
        });

        app.post("/scholarships", async (req, res) => {
            try {
                const {
                    scholarshipName,
                    universityName,
                    image,
                    country,
                    city,
                    worldRank,
                    subjectCategory,
                    scholarshipCategory,
                    degree,
                    tuitionFees,
                    applicationFees,
                    serviceCharge,
                    deadline
                } = req.body;

                const scholarship = {
                    scholarshipName,
                    universityName,
                    image,
                    country,
                    city,
                    worldRank,
                    subjectCategory,
                    scholarshipCategory,
                    degree,
                    tuitionFees,
                    applicationFees,
                    serviceCharge,
                    deadline,
                    createdAt: new Date()
                };

                const result = await scholarshipsCollection.insertOne(scholarship);
                res.send(result);
            } catch (error) {
                console.error("Failed to create scholarship", error);
                res.status(500).send({ message: "Failed to create scholarship." });
            }
        });

        app.get("/scholarships", async (req, res) => {
            try {
                const scholarships = await scholarshipsCollection.find().sort({ createdAt: -1 }).toArray();
                res.send(scholarships);
            } catch (error) {
                console.error("Failed to fetch scholarships", error);
                res.status(500).send({ message: "Failed to fetch scholarships." });
            }
        });
    } catch (error) {
        console.error("Failed to initialize database", error);
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Scholarship server is running on port: ${port}`);
});
