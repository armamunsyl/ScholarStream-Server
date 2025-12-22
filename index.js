const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const admin = require("firebase-admin");
require('dotenv').config();
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

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

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
    }

    const token = authorization.split(" ")[1];
    if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
        if (error) {
            return res.status(401).send({ message: "Unauthorized access" });
        }
        req.decoded = decoded;
        next();
    });
};

app.get('/', (req, res) => {
    res.send("Scholarship server is available");
});

app.post("/jwt", (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).send({ message: "Email is required to generate token." });
        }
        const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "1d" });
        res.send({ token });
    } catch (error) {
        console.error("Failed to generate token", error);
        res.status(500).send({ message: "Failed to generate token." });
    }
});

async function run() {
    try {
        await client.connect();
        const db = client.db("scholarshipDB");
        const usersCollection = db.collection("users");
        const scholarshipsCollection = db.collection("scholarships");
        const applicationsCollection = db.collection("applications");
        const reviewsCollection = db.collection("reviews");
        const paymentsCollection = db.collection("payments");

        const verifyAdmin = async (req, res, next) => {
            try {
                const email = req.decoded?.email;
                if (!email) {
                    return res.status(403).send({ message: "Forbidden access" });
                }

                const user = await usersCollection.findOne({ email });
                if (user?.role !== "admin") {
                    return res.status(403).send({ message: "Forbidden access" });
                }

                next();
            } catch (error) {
                console.error("Failed to verify admin", error);
                res.status(500).send({ message: "Failed to verify admin." });
            }
        };

        const verifyModerator = async (req, res, next) => {
            try {
                const email = req.decoded?.email;
                if (!email) {
                    return res.status(403).send({ message: "Forbidden access" });
                }

                const user = await usersCollection.findOne({ email });
                if (user?.role === "admin" || user?.role === "moderator") {
                    return next();
                }

                res.status(403).send({ message: "Forbidden access" });
            } catch (error) {
                console.error("Failed to verify moderator", error);
                res.status(500).send({ message: "Failed to verify moderator." });
            }
        };

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

        app.delete("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid user id." });
                }

                const filter = { _id: new ObjectId(id) };
                const user = await usersCollection.findOne(filter);

                if (!user) {
                    return res.status(404).send({ message: "User not found." });
                }

                const email = user.email;
                try {
                    const firebaseUser = await admin.auth().getUserByEmail(email);
                    await admin.auth().deleteUser(firebaseUser.uid);
                } catch (firebaseError) {
                    if (firebaseError.code !== "auth/user-not-found") {
                        console.error("Failed to delete Firebase user", firebaseError);
                        return res.status(500).send({ message: "Failed to delete Firebase user." });
                    }
                }

                const result = await usersCollection.deleteOne(filter);
                res.send(result);
            } catch (error) {
                console.error("Failed to delete user", error);
                res.status(500).send({ message: "Failed to delete user." });
            }
        });

        app.patch("/users/:id/role", async (req, res) => {
            try {
                const { id } = req.params;
                const { role } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid user id." });
                }

                const validRoles = ["admin", "moderator", "student"];
                if (!validRoles.includes(role)) {
                    return res.status(400).send({ message: "role must be admin, moderator, or student." });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: { role } };
                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                console.error("Failed to update user role", error);
                res.status(500).send({ message: "Failed to update user role." });
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

        app.patch("/scholarships/:id", async (req, res) => {
            try {
                const { id } = req.params;
              
                const updateData = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid scholarship id." });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: updateData };
                const result = await scholarshipsCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                console.error("Failed to update scholarship", error);
                res.status(500).send({ message: "Failed to update scholarship." });
            }
        });

        app.delete("/scholarships/:id", async (req, res) => {
            try {
                const { id } = req.params;
               

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid scholarship id." });
                }

                const filter = { _id: new ObjectId(id) };
                const result = await scholarshipsCollection.deleteOne(filter);
                res.send(result);
            } catch (error) {
                console.error("Failed to delete scholarship", error);
                res.status(500).send({ message: "Failed to delete scholarship." });
            }
        });

        app.post("/applications", async (req, res) => {
            try {
                const { studentEmail, studentName, universityName, applicationFees, universityAddress,scholarshipId,scholarshipName } = req.body;

                const application = {
                    studentEmail,
                    studentName,
                    universityName,
                    scholarshipName,
                    status: "pending",
                    payment: "unpaid",
                    applicationFees,
                    universityAddress,
                    scholarshipId,
                    createdAt: new Date()
                };

                const result = await applicationsCollection.insertOne(application);
                res.send(result);
            } catch (error) {
                console.error("Failed to create application", error);
                res.status(500).send({ message: "Failed to create application." });
            }
        });

        app.get("/applications", async (req, res) => {
            try {
                const applications = await applicationsCollection.find().sort({ createdAt: -1 }).toArray();
                res.send(applications);
            } catch (error) {
                console.error("Failed to fetch applications", error);
                res.status(500).send({ message: "Failed to fetch applications." });
            }
        });

        app.patch("/applications/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const { status, payment } = req.body || {};

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid application id." });
                }

                const updateFields = {};
                if (status) updateFields.status = status;
                if (payment) updateFields.payment = payment;

                if (Object.keys(updateFields).length === 0) {
                    return res.status(400).send({ message: "Nothing to update." });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: updateFields };
                const result = await applicationsCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                console.error("Failed to update application", error);
                res.status(500).send({ message: "Failed to update application." });
            }
        });

        app.delete("/applications/:id", async (req, res) => {
            try {
                const { id } = req.params;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid application id." });
                }

                const filter = { _id: new ObjectId(id) };
                const result = await applicationsCollection.deleteOne(filter);
                res.send(result);
            } catch (error) {
                console.error("Failed to delete application", error);
                res.status(500).send({ message: "Failed to delete application." });
            }
        });

        app.post("/reviews", async (req, res) => {
            try {
                const { userName, userPhotoURL, comment, rating, scholarshipId , userEmail,scholarshipName,universityName} = req.body;

                const review = {
                    userName,
                    userEmail,
                    scholarshipName,
                    universityName,
                    userPhotoURL,
                    comment,
                    rating,
                    scholarshipId,
                    createdAt: new Date()
                };

                const result = await reviewsCollection.insertOne(review);
                res.send(result);
            } catch (error) {
                console.error("Failed to create review", error);
                res.status(500).send({ message: "Failed to create review." });
            }
        });

        app.get("/reviews", async (req, res) => {
            try {
                const reviews = await reviewsCollection.find().sort({ createdAt: -1 }).toArray();
                res.send(reviews);
            } catch (error) {
                console.error("Failed to fetch reviews", error);
                res.status(500).send({ message: "Failed to fetch reviews." });
            }
        });

        app.patch("/reviews/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const updateData = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid review id." });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: updateData };
                const result = await reviewsCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                console.error("Failed to update review", error);
                res.status(500).send({ message: "Failed to update review." });
            }
        });

        app.delete("/reviews/:id", async (req, res) => {
            try {
                const { id } = req.params;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid review id." });
                }

                const filter = { _id: new ObjectId(id) };
                const result = await reviewsCollection.deleteOne(filter);
                res.send(result);
            } catch (error) {
                console.error("Failed to delete review", error);
                res.status(500).send({ message: "Failed to delete review." });
            }
        });

        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            try {
                const { amount } = req.body;
                if (!amount || amount <= 0) {
                    return res.status(400).send({ message: "Valid amount is required." });
                }

                const paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(amount * 100),
                    currency: "usd",
                    payment_method_types: ["card"]
                });

                res.send({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                console.error("Failed to create payment intent", error);
                res.status(500).send({ message: "Failed to create payment intent." });
            }
        });

        app.post("/payments", verifyJWT, async (req, res) => {
            try {
                const {
                    userEmail,
                    userName,
                    scholarshipId,
                    scholarshipName,
                    amount,
                    transactionId,
                    paymentMethod
                } = req.body;

                const payment = {
                    userEmail,
                    userName,
                    scholarshipId,
                    scholarshipName,
                    amount,
                    transactionId,
                    paymentMethod,
                    status: "paid",
                    createdAt: new Date()
                };

                const result = await paymentsCollection.insertOne(payment);
                res.send(result);
            } catch (error) {
                console.error("Failed to save payment", error);
                res.status(500).send({ message: "Failed to save payment." });
            }
        });

        app.get(
            "/payments",
            verifyJWT,
            async (req, res, next) => {
                try {
                    const email = req.query.email;
                    if (!email) {
                        return next();
                    }

                    if (email !== req.decoded?.email) {
                        return res.status(403).send({ message: "Forbidden access" });
                    }

                    const payments = await paymentsCollection.find({ userEmail: email }).sort({ createdAt: -1 }).toArray();
                    res.send(payments);
                } catch (error) {
                    console.error("Failed to fetch user payments", error);
                    res.status(500).send({ message: "Failed to fetch user payments." });
                }
            },
            verifyAdmin,
            async (req, res) => {
                try {
                    const payments = await paymentsCollection.find().sort({ createdAt: -1 }).toArray();
                    res.send(payments);
                } catch (error) {
                    console.error("Failed to fetch payments", error);
                    res.status(500).send({ message: "Failed to fetch payments." });
                }
            }
        );
    } catch (error) {
        console.error("Failed to initialize database", error);
    }
}
run().catch(console.dir);

module.exports = app;


// app.listen(port, () => {
//     console.log(`Scholarship server is running on port: ${port}`);
// });
