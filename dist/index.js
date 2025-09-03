import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import dotenv from 'dotenv';
import axios from 'axios';
import { z } from 'zod';
dotenv.config();
const server = Fastify({
    logger: true
});
await server.register(helmet);
const PAYPER_CHECKOUT_URL = process.env.PAYPER_CHECKOUT_URL || 'https://checkout-staging.payper.ca/api/v2/checkout-session';
const QuerySchema = z.object({
    amount: z.string().transform((v) => Number(v)).refine((v) => !Number.isNaN(v) && v > 0, 'amount must be a positive number'),
    product: z.string().min(1, 'product is required').catch('Deposit'),
    currency: z.string().default('CAD').transform((v) => v.toUpperCase()),
    return_url: z.string().url().optional(),
    failed_return_url: z.string().url().optional(),
    token: z.string().optional(),
});
const BodySchema = z.object({
    amount: z.number().positive(),
    product: z.string().min(1),
    currency: z.string().default('CAD').transform((v) => v.toUpperCase()).optional(),
    return_url: z.string().url().optional(),
    failed_return_url: z.string().url().optional(),
    token: z.string().optional(),
});
function extractBearerToken(header) {
    if (!header)
        return null;
    const trimmed = header.trim();
    if (/^Bearer\s+/i.test(trimmed))
        return trimmed;
    return `Bearer ${trimmed}`;
}
server.get('/health', async () => ({ status: 'ok' }));
server.get('/checkout', async (req, reply) => {
    try {
        const authHeader = req.headers['authorization'];
        const parsed = QuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
        }
        const providedToken = parsed.data.token;
        const bearer = extractBearerToken(providedToken || authHeader);
        if (!bearer) {
            return reply.status(401).send({ error: 'missing_authorization', message: 'Authorization header with Bearer token is required' });
        }
        const { amount, product, currency, return_url, failed_return_url } = parsed.data;
        const payload = {
            customer: {
                email: 'placeholder@example.com',
                billing_info: {
                    first_name: 'Holland',
                    last_name: 'Customer',
                    address: '123 Main Street',
                    city: 'Toronto',
                    state: 'ON',
                    zip_code: 'M5V 3A8',
                    country: 'CA',
                    company: 'Holland Leasing',
                    phone: '+14160000000',
                    ip_address: req.ip
                },
            },
            session_info: {
                session_type: 'payment',
                session_methods: [
                    { method: 'wire_transfer', preferred: false },
                    { method: 'etransfer_request_money', preferred: true }
                ]
            },
            checkout_items: [
                {
                    name: product || 'Holland Deposit',
                    quantity: 1,
                    description: 'Secure deposit payment',
                    SKU: 'deposit',
                    unit_price: amount,
                    item_type: 'physical',
                    image_url: 'https://static.vecteezy.com/system/resources/previews/035/662/363/non_2x/luxury-car-front-view-icon-free-vector.jpg'
                }
            ],
            convenience_fee: 0.0,
            currency: (currency || 'CAD'),
            udfs: [
                `deposit_${Date.now()}`,
                'deposit',
                'holland_leasing',
                Date.now().toString(),
                'Holland Leasing Inc',
                new Date().toLocaleDateString(),
                'TD'
            ],
            return_url: return_url || `${req.protocol}://${req.headers.host}/payment-return`,
            failed_return_url: failed_return_url || `${req.protocol}://${req.headers.host}/checkout-failed`,
            merchant_ntf_url: process.env.MERCHANT_NTF_URL,
            notification_info: process.env.NOTIFY_EMAIL || process.env.NOTIFY_PHONE ? {
                email_addresses: process.env.NOTIFY_EMAIL ? [process.env.NOTIFY_EMAIL] : undefined,
                phone_numbers: process.env.NOTIFY_PHONE ? [process.env.NOTIFY_PHONE] : undefined,
            } : undefined,
        };
        const response = await axios.post(PAYPER_CHECKOUT_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': bearer,
            }
        });
        const data = response.data;
        const url = data?.data?.url;
        if (!url) {
            req.log.error({ data }, 'Unexpected response from checkout API');
            return reply.status(502).send({ error: 'bad_gateway', message: 'Checkout API did not return a URL' });
        }
        // 302 redirect to checkout URL
        reply.code(302).header('Location', url).send();
    }
    catch (err) {
        const status = err.response?.status || 500;
        const details = err.response?.data || { message: err.message };
        req.log.error({ err: details }, 'Checkout creation failed');
        reply.status(status).send({ error: 'checkout_failed', details });
    }
});
server.post('/checkout', async (req, reply) => {
    try {
        const authHeader = req.headers['authorization'];
        const parsed = BodySchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
        }
        const providedToken = parsed.data.token;
        const bearer = extractBearerToken(providedToken || authHeader);
        if (!bearer) {
            return reply.status(401).send({ error: 'missing_authorization', message: 'Authorization header with Bearer token is required' });
        }
        const { amount, product, currency, return_url, failed_return_url } = parsed.data;
        const payload = {
            customer: {
                email: 'placeholder@example.com',
                billing_info: {
                    first_name: 'Holland',
                    last_name: 'Customer',
                    address: '123 Main Street',
                    city: 'Toronto',
                    state: 'ON',
                    zip_code: 'M5V 3A8',
                    country: 'CA',
                    company: 'Holland Leasing',
                    phone: '+14160000000',
                    ip_address: req.ip
                },
            },
            session_info: {
                session_type: 'payment',
                session_methods: [
                    { method: 'wire_transfer', preferred: false },
                    { method: 'etransfer_request_money', preferred: true }
                ]
            },
            checkout_items: [
                {
                    name: product || 'Holland Deposit',
                    quantity: 1,
                    description: 'Secure deposit payment',
                    SKU: 'deposit',
                    unit_price: amount,
                    item_type: 'physical',
                    image_url: 'https://static.vecteezy.com/system/resources/previews/035/662/363/non_2x/luxury-car-front-view-icon-free-vector.jpg'
                }
            ],
            convenience_fee: 0.0,
            currency: (currency || 'CAD'),
            udfs: [
                `deposit_${Date.now()}`,
                'deposit',
                'holland_leasing',
                Date.now().toString(),
                'Holland Leasing Inc',
                new Date().toLocaleDateString(),
                'TD'
            ],
            return_url: return_url || `${req.protocol}://${req.headers.host}/payment-return`,
            failed_return_url: failed_return_url || `${req.protocol}://${req.headers.host}/checkout-failed`,
            merchant_ntf_url: process.env.MERCHANT_NTF_URL,
            notification_info: process.env.NOTIFY_EMAIL || process.env.NOTIFY_PHONE ? {
                email_addresses: process.env.NOTIFY_EMAIL ? [process.env.NOTIFY_EMAIL] : undefined,
                phone_numbers: process.env.NOTIFY_PHONE ? [process.env.NOTIFY_PHONE] : undefined,
            } : undefined,
        };
        const response = await axios.post(PAYPER_CHECKOUT_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': bearer,
            }
        });
        const data = response.data;
        const url = data?.data?.url;
        if (!url) {
            req.log.error({ data }, 'Unexpected response from checkout API');
            return reply.status(502).send({ error: 'bad_gateway', message: 'Checkout API did not return a URL' });
        }
        reply.send({ url, session_id: data?.data?.session_id, raw: data });
    }
    catch (err) {
        const status = err.response?.status || 500;
        const details = err.response?.data || { message: err.message };
        req.log.error({ err: details }, 'Checkout creation failed');
        reply.status(status).send({ error: 'checkout_failed', details });
    }
});
const PORT = Number(process.env.PORT || 8080);
server.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
    server.log.error(err);
    process.exit(1);
});
