const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
require('dotenv').config();
const app = express();
app.use(cors({
    origin: ['http://localhost:5173', 'https://fit-gym-7bce5.web.app','https://gym-omega-black.vercel.app'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));
app.use(express.json());
const PORT = process.env.PORT || 5000;

// Stripe integration
const stripe = require('stripe')(process.env.STRIPE_SECRET);

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASS}@cluster0.zuuvjs1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Middleware
const authenticateToken = async(req, res, next) => {
    const token = await req?.headers['authorization']?.split(' ')[1];
    console.log('Token 23:', token);

    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        console.log('Reached token verification');
        if (err) return res.status(403).json({ message: 'Forbidden' });
        console.log('Verified User:', user);
        req.user = user;
        next();
    });
};

const authorizeRole = (...roles) => {
    return (req, res, next) => {
        console.log('User Role:', req.user.userRole);
        console.log('Allowed Roles:', roles);
        if (!roles.includes(req.user.userRole)) {
            return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
        }
        console.log('Role authorized');
        next();
    };
};

// MongoDB Client
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Collections
        const usersCollection = client.db('GYM').collection('users');
        const subscriptionsCollection = client.db('GYM').collection('subscriptions');

        // Update user details in subscriptions
        app.patch('/users/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
            const userId = req.params.id;
            const updatedSubscription = await subscriptionsCollection.updateOne(
                { _id: new ObjectId(userId) },
                { $set: req.body },
                { upsert: true }
            );

            res.status(200).send(updatedSubscription);
        });

        // Delete subscription by ID
        app.delete('/users/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
            const userId = req.params.id;
            const result = await subscriptionsCollection.deleteOne({ _id: new ObjectId(userId) });
            res.status(200).send('Subscription deleted');
        });

        // Get all users
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find({}).toArray();
            res.status(200).send(result);
        });

        // Get user by ID
        app.get('/users/:id', async (req, res) => {
            const userId = req.params.id;
            const result = await subscriptionsCollection.findOne({ _id: new ObjectId(userId) });
            res.status(200).send(result);
        });

        // Subscriptions
        app.post('/subscriptions', async (req, res) => {
            try {
                const { info } = req.body;
                console.log('Info:', info);

                // Add createdAt timestamp
                const subscriptionData = {
                    ...info,
                    createdAt: new Date(),
                    status: 'active'
                };

                const result = await subscriptionsCollection.insertOne(subscriptionData);
                res.status(200).send(result);
            } catch (err) {
                console.error('Error inserting subscription:', err);
                res.status(500).send({ error: 'Failed to save subscription' });
            }
        });

        // Get subscriptions
        app.get('/subscriptions', async (req, res) => {
            const result = await subscriptionsCollection.find({}).toArray();
            res.status(200).send(result);
        });

        // Stripe integration
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;

            // Ensure price is valid
            if (price < 0) {
                return res.status(400).send({ error: 'Price must be greater than zero' });
            }

            const amount = parseFloat(price * 100);
            const { client_secret } = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            res.status(200).send({ clientSecret: client_secret });
        });

        // Register route
        app.post('/users', async (req, res) => {
            const result = await usersCollection.insertOne(req.body);
            res.status(200).send(result);
        });

        // Login route
        app.post('/login', async (req, res) => {
            const user = await usersCollection.findOne({ email: req.body?.email });

            if (!user) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            try {
                // Generate JWT token
                const token = jwt.sign({ userRole: user?.role, userEmail: user?.email }, process.env.JWT_SECRET, {
                    expiresIn: '1h',
                });
                console.log('Generated Token:', token);
                res.json({ token });
            } catch (error) {
                console.log('Error:', error);
            }
        });

        // Confirm connection to MongoDB
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } finally {
        // Optional: Add code to close the MongoDB connection if needed
    }
}
run().catch(console.dir);

// Root route
app.get('/', (req, res) => {
    res.send(`Server is running at ${PORT}`);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
