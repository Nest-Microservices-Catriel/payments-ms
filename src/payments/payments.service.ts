import { Inject, Injectable, Logger } from '@nestjs/common';
import { envs, NATS_SERVICE } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);
  private readonly logger = new Logger('Payment Service');
  constructor(@Inject(NATS_SERVICE) private readonly clientNats: ClientProxy) {}
  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;

    const line_items = items.map((item) => {
      return {
        price_data: {
          currency,
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100), // 20usd
        },
        quantity: item.quantity,
      };
    });

    const session = await this.stripe.checkout.sessions.create({
      // colocar el id de mi orden
      payment_intent_data: {
        metadata: {
          orderId,
        },
      },

      //items que la gente esta comprando
      line_items: line_items,
      mode: 'payment',
      success_url: envs.stripeSuccessUrl,
      cancel_url: envs.stripeCancelUrl,
    });
    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
  }

  async stripeWebHook(req: Request, res: Response) {
    let event: Stripe.Event;

    //testing
    // const endpointSecret =
    //   'whsec_579990355d124cfbaae479b671b6afa6b7602eb9b9ae951f1ad0e943951c8272';
    const endpointSecret = envs.stripeEndpointSecret;
    const sig = req.headers['stripe-signature'];
    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        sig,
        endpointSecret,
      );
    } catch (error) {
      res.status(400).send(`Webhook Error: ${error.message}`);
      return;
    }

    switch (event.type) {
      case 'charge.succeeded':
        const chargeSucceeded = event.data.object;
        console.log({ metada: chargeSucceeded.metadata });
        const payload = {
          stripePaymentId: chargeSucceeded.id,
          orderId: chargeSucceeded.metadata.orderId,
          receiptUrl: chargeSucceeded.receipt_url,
        };
        this.logger.log(payload);
        this.clientNats.emit('payment.succeeded', payload);
        break;
      default:
        console.log(`Event ${event.type} not handled`);
    }
    res.status(200).json({ sig });
  }
}
