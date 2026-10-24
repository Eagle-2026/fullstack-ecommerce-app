import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_test_")) {
  throw new Error("A Stripe TEST secret key is required for Day 6");
}

export const stripe = new Stripe(stripeSecretKey);
