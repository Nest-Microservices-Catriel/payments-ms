import { Injectable } from '@nestjs/common';
import { envs } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);

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
    return session;
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
        break;
      default:
        console.log(`Event ${event.type} not handled`);
    }
    res.status(200).json({ sig });
  }
}
