if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.form.querySelector('[name=id]').disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading-overlay__spinner').classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButton.querySelector('span').classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              window.location = window.routes.cart_url;
              return;
            }

            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, { source: 'product-form', productVariantId: formData.get('id') });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    this.cart.renderContents(response);
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              this.cart.renderContents(response);
            }

            // Check if the specific product is already in the cart
            fetch(`${routes.cart_url}.js`)
              .then((response) => response.json())
              .then((cart) => {
                const specificVariantId = '47237837488365';
                const specificProductInCart = cart.items.some(
                  (item) => item.variant_id.toString() === specificVariantId
                );

                if (!specificProductInCart) {
                  this.submitButton.setAttribute('aria-disabled', 'true');
                  this.submitButton.classList.add('loading');

                  const specificProductQuantity = 1;
                  const specificProductBody = new FormData();
                  specificProductBody.append('id', specificVariantId);
                  specificProductBody.append('quantity', specificProductQuantity);
                  if (this.cart && typeof this.cart.getSectionsToRender === 'function') {
                    specificProductBody.append(
                      'sections',
                      this.cart.getSectionsToRender().map((section) => section.id)
                    );
                    specificProductBody.append('sections_url', window.location.pathname);
                  }
                  const specificProductConfig = { ...config, body: specificProductBody };

                  return fetch(`${routes.cart_add_url}`, specificProductConfig)
                    .then((response) => response.json())
                    .then((response) => {
                      if (!response.status) {
                        // Prepend div to #CartDrawer-Checkout with a link to /checkout
                        const checkoutLink = document.createElement('div');
                        checkoutLink.classList.add('cart-drawer__checkout-link-wrapper');
                        checkoutLink.innerHTML = `
                          <a href="/cart/checkout" class="cart-drawer__checkout-link">
                            <span>Checkout</span>
                          </a>
                        `;
                        const checkoutButton = document.querySelector('#CartDrawer-Checkout');
                        checkoutButton.parentNode.insertBefore(checkoutLink, checkoutButton);

                        publish(PUB_SUB_EVENTS.cartUpdate, {
                          source: 'product-form',
                          productVariantId: specificVariantId,
                          errors: response.errors || response.description,
                          message: response.message,
                        });
                      }
                    })
                    .catch((error) => {
                      console.error('Error adding product to cart:', error);
                    })
                    .finally(() => {
                      this.submitButton.classList.remove('loading');
                      this.submitButton.removeAttribute('aria-disabled');
                    });
                }
              })
              .catch((error) => {
                console.error('Error fetching cart:', error);
                this.submitButton.classList.remove('loading');
                this.submitButton.removeAttribute('aria-disabled');
              });

            // Check for discount conflicts after adding product to cart
            checkForDiscountConflicts();
            reorderCartItems();

            // After successfully adding the product, check if we need to add the specific product
            this.addSpecificProductIfNeeded();
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading-overlay__spinner').classList.add('hidden');
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      addSpecificProductIfNeeded() {
        const specificVariantId = '47237837488365';

        // Check if the specific product is already in the cart
        fetch(`${routes.cart_url}.js`)
          .then((response) => response.json())
          .then((cart) => {
            const specificProductInCart = cart.items.some((item) => item.variant_id.toString() === specificVariantId);

            if (!specificProductInCart) {
              // If the specific product is not in the cart, add it
              const specificProductBody = new FormData();
              specificProductBody.append('id', specificVariantId);
              specificProductBody.append('quantity', 1);

              const config = fetchConfig('javascript');
              config.headers['X-Requested-With'] = 'XMLHttpRequest';
              delete config.headers['Content-Type'];
              config.body = specificProductBody;

              return fetch(`${routes.cart_add_url}`, config)
                .then((response) => response.json())
                .then((response) => {
                  if (!response.status) {
                    publish(PUB_SUB_EVENTS.cartUpdate, {
                      source: 'product-form',
                      productVariantId: specificVariantId,
                      errors: response.errors || response.description,
                      message: response.message,
                    });
                  }
                  // Refresh the cart contents
                  if (this.cart) {
                    this.cart.renderContents(response);
                    // Add this line to update the pricing after rendering
                    updateCartItemPricing();
                  }
                })
                .catch((error) => {
                  console.error('Error adding specific product to cart:', error);
                });
            }
          })
          .catch((error) => {
            console.error('Error fetching cart:', error);
          });
      }
    }
  );
}

// Check if the variable is already declared
if (typeof isAddingDiscount1Product === 'undefined') {
  var isAddingDiscount1Product = false; // Use var to allow multiple declarations
}

// Function to observe cart-drawer element for active state
function observeCartDrawer() {
  const cartDrawer = document.querySelector('cart-drawer');

  if (cartDrawer) {
    const observer = new MutationObserver(() => {
      if (cartDrawer.classList.contains('active')) {
        checkAndRemoveSpecificVariant(() => {
          reorderCartItems();
        });
      }
    });

    observer.observe(cartDrawer, { attributes: true, attributeFilter: ['class'] });
  }
}

// Function to check and remove the specific variant if it's the only item in the cart
function checkAndRemoveSpecificVariant(callback) {
  const specificVariantId = '47237837488365';

  fetch(`${routes.cart_url}.js`)
    .then((response) => response.json())
    .then((cart) => {
      if (cart.items.length === 1 && cart.items[0].variant_id.toString() === specificVariantId) {
        // The specific variant is the only item in the cart, so remove it
        const data = {
          id: specificVariantId,
          quantity: 0,
        };

        fetch(`${routes.cart_change_url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify(data),
        })
          .then((response) => response.json())
          .then((updatedCart) => {
            // Refresh the cart contents
            if (document.querySelector('cart-drawer')) {
              document.querySelector('cart-drawer').renderContents(updatedCart);
            }
            if (callback) callback();
          })
          .catch((error) => {
            console.error('Error removing specific variant from cart:', error);
            if (callback) callback();
          });
      } else {
        if (callback) callback();
      }
    })
    .catch((error) => {
      console.error('Error fetching cart:', error);
      if (callback) callback();
    });
}

// Function to reorder cart items
function reorderCartItems() {
  const cartItems = document.querySelectorAll('.cart-item');
  cartItems.forEach((item) => {
    const totalsElement = item.querySelector('.cart-item__totals');
    const quantityElement = item.querySelector('.cart-item__quantity');
    if (totalsElement && quantityElement && quantityElement.nextSibling !== totalsElement) {
      item.insertBefore(totalsElement, quantityElement);
    }
  });
}

// Check if the variable is already declared
if (typeof isAddingDiscount1Product === 'undefined') {
  var isAddingDiscount1Product = false; // Use var to allow multiple declarations
}

function addDiscount1Product() {
  if (isAddingDiscount1Product) return; // Prevent multiple calls

  isAddingDiscount1Product = true; // Set flag

  const specificVariantId = '47237837488365';
  const specificProductQuantity = 1;
  const specificProductBody = new FormData();
  specificProductBody.append('id', specificVariantId);
  specificProductBody.append('quantity', specificProductQuantity);

  const config = fetchConfig('javascript');
  config.headers['X-Requested-With'] = 'XMLHttpRequest';
  delete config.headers['Content-Type'];
  config.body = specificProductBody;

  fetch(`${routes.cart_add_url}`, config)
    .then((response) => response.json())
    .then((response) => {
      if (!response.status) {
        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'product-form',
          productVariantId: specificVariantId,
          errors: response.errors || response.description,
          message: response.message,
        });
      }
    })
    .catch((error) => {
      console.error('Error adding product to cart:', error);
    })
    .finally(() => {
      const submitButton = document.querySelector('product-form').querySelector('[type="submit"]');
      submitButton.classList.remove('loading');
      submitButton.removeAttribute('aria-disabled');
      isAddingDiscount1Product = false; // Reset flag
    });
}

// Add event listener to check for discount conflicts on page load
document.addEventListener('DOMContentLoaded', () => {
  observeCartDrawer();
  checkAndRemoveSpecificVariant(); // Add this line to check on page load
});

function updateCartItemPricing() {
  const cartItems = document.querySelectorAll('.cart-item');
  const specificVariantId = '47237837488365';

  cartItems.forEach((item) => {
    const variantId = item.classList.contains(`cart-item-${specificVariantId}`);
    const priceElement = item.querySelector('.cart-item__details .product-option');

    if (variantId && priceElement) {
      const discountedPriceHtml = `
        <div class="cart-item__discounted-prices">
          <span class="visually-hidden">
            ${window.theme.strings.regularPrice || 'Regular price'}
          </span>
          <s class="cart-item__old-price product-option">$95.00</s>
          <span class="visually-hidden">
            ${window.theme.strings.salePrice || 'Sale price'}
          </span>
          <strong class="cart-item__final-price product-option">
            ${priceElement.textContent}
          </strong>
        </div>
      `;
      priceElement.outerHTML = discountedPriceHtml;
    }
  });
}

// Add an event listener for cart updates
document.addEventListener('cart:updated', (event) => {
  updateCartItemPricing();
});

// Call updateCartItemPricing on page load
document.addEventListener('DOMContentLoaded', () => {
  updateCartItemPricing();
});
