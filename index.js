const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt');
const cors = require('cors')
require('dotenv').config();
const app = express()
app.use(cors())
app.use(express.json())
const PORT = process.env.PORT || 5000
// stripe integration
const stripe = require('stripe')(process.env.STRIPE_SECRET)

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASS}@cluster0.zuuvjs1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// middleware


const authenticateToken = (req, res, next) => {

    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Forbidden' });
        req.user = user;
        next();
    });
};
const authorizeRole = (...role) => {
    return (req, res, next) => {
        // console.log('req:', req.user)
        if (req.user.userRole !== role) {
            return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
        }

        next();
    };
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        // COLLECTION
        const usersCollection = client.db('GYM').collection('users');
        const subscriptionsCollection = client.db('GYM').collection('subscriptions');
      
        
        // update users details in subscriptions 

        app.patch('/users/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
            const userId = req.params.id;
            const updatedSubscription = await subscriptionsCollection.updateOne(
                { _id: new ObjectId(userId) },
                {
                    $set: req.body
                },
                {
                    upsert: true,
                }
            );
            // console.log(updatedSubscription);
            res.status(200).send(updatedSubscription);
        });
        // delete subscriptions by id 
        app.delete('/users/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
            const userId = req.params.id;
            const result = await subscriptionsCollection.deleteOne({ _id: new ObjectId(userId) });
            // console.log('result:', result)
            res.status(200).send('Subscription deleted');
        })


        // get all users
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find({}).toArray();
            // console.log('result:', result)
            res.status(200).send(result);
        })

        // get user by id 
        app.get('/users/:id', async (req, res) => {

            const userId = req.params.id;
            const result = await subscriptionsCollection.findOne({ _id: new ObjectId(userId) });
            res.status(200).send(result);
        })

        // SUBSCRIPTIONS 
        app.post('/subscriptions', async (req, res) => {
            try {
                const { info } = req.body;
                // console.log('info:', info);

                // Add createdAt timestamp
                const subscriptionData = {
                    ...info,
                    createdAt: new Date(), // Current date and time
                    status: 'active'

                };

                const result = await subscriptionsCollection.insertOne(subscriptionData);
                res.status(200).send(result);
            } catch (err) {
                // console.error('Error inserting subscription:', err);
                res.status(500).send({ error: 'Failed to save subscription' });
            }
        });
        // get subscriptions
        app.get('/subscriptions', async (req, res) => {
            const result = await subscriptionsCollection.find({}).toArray();
            res.status(200).send(result);
        })

        // stripe integration
        app.post("/create-payment-intent", async (req, res) => {
            const { price, user } = req.body;

            // condition for price
            if (price < 0) {
                return res.status(400).send({ error: 'Price must be greater than zero' })
            }
            const amount = parseFloat(price * 100);
            // Create a PaymentIntent with the order amount and currency
            const { client_secret } = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                automatic_payment_methods: {
                    enabled: true,
                },
            });
            res.status(200).send(
                { clientSecret: client_secret }
            )
        })

        // its a register route
        app.post('/users', async (req, res) => {
            // console.log(req.body);
            const result = await usersCollection.insertOne(req.body);
            res.status(200).send(result);
        })
        //  its a login route
        app.post('/login', async (req, res) => {
            // console.log(req.body);
            const user = await usersCollection.findOne({ email: req.body?.email });
            // console.log('user:', user)
            if (!user) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }
            // console.log(user.email);

            try {
                // generate jwt token
                const token = jwt.sign({ userRole: user?.role, userEmail: user?.email }, process.env.JWT_SECRET, {
                    expiresIn: '1h',
                })
                // console.log(token);
                res.json({ token });
            } catch (error) {
                console.log('error:', error)

            }
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);

// get data

app.get('/', (req, res) => {
    res.send(`server is running at ${PORT}`)
})
app.listen(PORT, (req, res) => {
    console.log(`Server is running on port ${PORT}`);
})